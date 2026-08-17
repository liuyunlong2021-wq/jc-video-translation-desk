#!/usr/bin/env python3

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from pathlib import Path


MODEL_IDS = {
    "asr": "iic/SenseVoiceSmall",
    "vad": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
    "punc": "iic/punc_ct-transformer_cn-en-common-vocab471067-large",
    "speaker": "iic/speech_campplus_sv_zh-cn_16k-common",
}
MODEL_DIRS = {
    "asr": "iic--SenseVoiceSmall/snapshots/master",
    "vad": "iic--speech_fsmn_vad_zh-cn-16k-common-pytorch/snapshots/master",
    "punc": "iic--punc_ct-transformer_cn-en-common-vocab471067-large/snapshots/master",
    "speaker": "iic--speech_campplus_sv_zh-cn_16k-common/snapshots/master",
}
ENGINE = "funasr-1.4.1-sensevoice-small-ct-punc-v3"
OCR_ENGINE = "rapid-videocr-3.1.1-rapidocr-vsf"


def model_paths(root: Path) -> dict[str, Path]:
    base = root / "models"
    paths = {name: base / relative for name, relative in MODEL_DIRS.items()}
    missing = [str(path) for path in paths.values() if not path.is_dir()]
    if missing:
        raise RuntimeError("FunASR model is missing: " + ", ".join(missing))
    return paths


def download(root: Path) -> None:
    from modelscope.hub.snapshot_download import snapshot_download

    root.mkdir(parents=True, exist_ok=True)
    for name, model_id in MODEL_IDS.items():
        path = snapshot_download(model_id, cache_dir=str(root))
        print(f"{name}: {path}", flush=True)


def split_on_long_silence(
    text: str,
    timestamps: list,
    gap_ms: int = 1500,
    max_duration_ms: int = 5000,
    max_chars: int = 22,
) -> list[tuple[str, int, int]]:
    units = [
        match
        for match in re.finditer(r"[A-Za-z0-9]+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]|[^\s]", text)
        if not unicodedata.category(match.group()[0]).startswith("P")
    ]
    if len(units) != len(timestamps) or not timestamps:
        return [(text, int(timestamps[0][0]), int(timestamps[-1][1]))] if timestamps else []
    hard_boundaries = [
        index
        for index in range(1, len(timestamps))
        if timestamps[index][0] - timestamps[index - 1][1] > gap_ms
    ]
    chunks = []
    starts = [0, *hard_boundaries]
    ends = [*hard_boundaries, len(timestamps)]
    punctuation = re.compile(r"[，。！？；：,.!?;:]")
    for group_start, group_end in zip(starts, ends):
        start = group_start
        while start < group_end:
            end = start + 1
            candidate = end + 1
            while candidate <= group_end:
                text_end = units[candidate].start() if candidate < len(units) else len(text)
                visible_chars = len(re.sub(r"\s", "", text[units[start].start():text_end]))
                duration = int(timestamps[candidate - 1][1]) - int(timestamps[start][0])
                if visible_chars > max_chars or duration > max_duration_ms:
                    break
                end = candidate
                candidate += 1
            if end < group_end:
                candidates = range(start + 1, end + 1)
                punctuated = [
                    index
                    for index in candidates
                    if punctuation.search(text[units[index - 1].end():units[index].start()])
                ]
                paused = [
                    index
                    for index in candidates
                    if int(timestamps[index][0]) - int(timestamps[index - 1][1]) >= 250
                ]
                end = (punctuated or paused or [end])[-1]
            text_start = units[start].start()
            text_end = units[end].start() if end < len(units) else len(text)
            chunk = text[text_start:text_end].strip()
            if chunk:
                chunks.append((chunk, int(timestamps[start][0]), int(timestamps[end - 1][1])))
            start = end
    return chunks


def transcribe(root: Path, audio: Path, device: str) -> dict:
    import torch
    from funasr import AutoModel

    if not audio.is_file():
        raise RuntimeError(f"Audio file does not exist: {audio}")
    paths = model_paths(root)
    selected_device = device
    if device == "auto":
        selected_device = "mps" if torch.backends.mps.is_available() else "cpu"

    started = time.monotonic()
    model = AutoModel(
        model=str(paths["asr"]),
        vad_model=str(paths["vad"]),
        punc_model=str(paths["punc"]),
        spk_model=str(paths["speaker"]),
        vad_kwargs={"max_single_segment_time": 30000},
        device=selected_device,
        disable_update=True,
    )
    loaded = time.monotonic()
    records = model.generate(
        input=str(audio),
        batch_size_s=300,
        sentence_timestamp=True,
        output_timestamp=True,
        return_time_stamps=True,
    )
    finished = time.monotonic()
    record = records[0] if records else {}
    cues = []
    speaker_ids = {}
    for segment in record.get("sentence_info") or []:
        raw = segment.get("sentence") or segment.get("text") or ""
        text = re.sub(r"<\|[^|]+\|>", "", raw).strip()
        timestamps = segment.get("timestamp") or []
        pieces = split_on_long_silence(text, timestamps) or [
            (text, int(segment.get("start", -1)), int(segment.get("end", -1)))
        ]
        if not text:
            continue
        tags = re.findall(r"<\|([^|]+)\|>", raw)
        raw_speaker = str(segment.get("spk", 0))
        speaker = speaker_ids.setdefault(raw_speaker, len(speaker_ids))
        for piece, start, end in pieces:
            if start < 0 or end <= start:
                continue
            piece_start = next((i for i, item in enumerate(timestamps) if int(item[0]) >= start), 0)
            piece_end = next((i for i, item in enumerate(timestamps[piece_start:], piece_start) if int(item[1]) > end), len(timestamps) - 1)
            units = re.findall(r"[A-Za-z0-9]+|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]|[^\s]", piece)
            word_timestamps = [
                {"text": token, "startMs": int(timestamps[i][0]), "endMs": int(timestamps[i][1])}
                for i, token in zip(range(piece_start, min(piece_end + 1, len(timestamps))), units)
            ]
            cues.append(
                {
                    "cueId": f"cue-{len(cues) + 1:03d}",
                    "startMs": start,
                    "endMs": end,
                    "recognizedText": piece,
                    "speakerCluster": f"speaker-{speaker}",
                    "language": tags[0] if tags else None,
                    "emotion": tags[1] if len(tags) > 1 else None,
                    "audioEvent": tags[2] if len(tags) > 2 else None,
                    "words": word_timestamps,
                }
            )
    return {
        "schemaVersion": 1,
        "engine": ENGINE,
        "device": selected_device,
        "loadSeconds": round(loaded - started, 3),
        "inferSeconds": round(finished - loaded, 3),
        "cues": cues,
    }


def probe(root: Path, device: str) -> None:
    import torch
    from funasr import AutoModel

    paths = model_paths(root)
    selected_device = "mps" if device == "auto" and torch.backends.mps.is_available() else device
    if selected_device == "auto":
        selected_device = "cpu"
    AutoModel(
        model=str(paths["asr"]),
        vad_model=str(paths["vad"]),
        punc_model=str(paths["punc"]),
        spk_model=str(paths["speaker"]),
        device=selected_device,
        disable_update=True,
    )
    print("FUNASR_PROBE_OK", flush=True)


def normalize_ocr_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", text)
    return text


def similar_text(left: str, right: str) -> float:
    from difflib import SequenceMatcher

    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def rapidocr_subtitle_text(
    result,
    frame_height: int,
    min_score: float = 0.65,
    min_center_y_ratio: float = 0.0,
) -> str:
    raw_boxes = getattr(result, "boxes", None)
    raw_txts = getattr(result, "txts", None)
    raw_scores = getattr(result, "scores", None)
    boxes = list(raw_boxes) if raw_boxes is not None else []
    txts = list(raw_txts) if raw_txts is not None else []
    scores = list(raw_scores) if raw_scores is not None else []
    if not scores:
        scores = [1.0] * len(txts)
    lines = []
    for box, text, score in zip(boxes, txts, scores):
        text = normalize_ocr_text(str(text))
        if not text or float(score) < min_score:
            continue
        x_values = [float(point[0]) for point in box]
        y_values = [float(point[1]) for point in box]
        width = max(x_values) - min(x_values)
        height = max(y_values) - min(y_values)
        center_y = (max(y_values) + min(y_values)) / 2
        if center_y < frame_height * min_center_y_ratio:
            continue
        if width < height * 1.5:
            continue
        lines.append((center_y, min(x_values), text))
    return normalize_ocr_text(" ".join(text for _, _, text in sorted(lines)))


def detect_active_video_bounds(capture, duration_ms: int) -> tuple[int, int, int, int] | None:
    import cv2
    import numpy as np

    sample_points = [0]
    if duration_ms > 0:
        sample_points.extend([duration_ms * ratio // 4 for ratio in [1, 2, 3]])
    bounds = []
    for point in sample_points:
        capture.set(cv2.CAP_PROP_POS_MSEC, int(point))
        ok, frame = capture.read()
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = gray > 16
        ys, xs = np.where(mask)
        if not len(xs) or not len(ys):
            continue
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        if (x1 - x0) * (y1 - y0) < frame.shape[0] * frame.shape[1] * 0.1:
            continue
        bounds.append((x0, y0, x1, y1))
    if not bounds:
        return None
    return (
        min(item[0] for item in bounds),
        min(item[1] for item in bounds),
        max(item[2] for item in bounds),
        max(item[3] for item in bounds),
    )


def subtitle_roi(frame, active_bounds: tuple[int, int, int, int] | None):
    height, width = frame.shape[:2]
    x0, y0, x1, y1 = active_bounds or (0, 0, width, height)
    active_height = max(1, y1 - y0)
    roi_y0 = max(0, y0 + int(active_height * 0.62))
    roi_y1 = min(height, y0 + int(active_height * 0.96))
    return frame[roi_y0:roi_y1, x0:x1]


def direct_rapidocr_video(video: Path, sample_ms: int = 750) -> dict:
    import cv2
    from rapidocr import RapidOCR

    capture = cv2.VideoCapture(str(video))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 25
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    duration_ms = int(frame_count / fps * 1000) if fps and frame_count else 0
    active_bounds = detect_active_video_bounds(capture, duration_ms)
    engine = RapidOCR()
    started = time.monotonic()
    active = None
    cues = []
    cursor = 0
    while duration_ms <= 0 or cursor <= duration_ms:
        capture.set(cv2.CAP_PROP_POS_MSEC, cursor)
        ok, frame = capture.read()
        if not ok:
            break
        roi = subtitle_roi(frame, active_bounds)
        text = rapidocr_subtitle_text(engine(roi), int(roi.shape[0]))
        if not text:
            if active and cursor - active["lastMs"] > sample_ms * 2:
                cues.append(active)
                active = None
            cursor += sample_ms
            continue
        if active and similar_text(active["text"], text) >= 0.86:
            active["lastMs"] = cursor
            active["text"] = text if len(text) > len(active["text"]) else active["text"]
        else:
            if active:
                cues.append(active)
            active = {"text": text, "startMs": cursor, "lastMs": cursor}
        cursor += sample_ms
    capture.release()
    if active:
        cues.append(active)
    normalized = []
    for cue in cues:
        start = max(0, int(cue["startMs"]) - sample_ms)
        end = min(duration_ms or int(cue["lastMs"]) + sample_ms, int(cue["lastMs"]) + sample_ms)
        if end <= start or not cue["text"]:
            continue
        normalized.append(
            {
                "cueId": f"cue-{len(normalized) + 1:03d}",
                "startMs": start,
                "endMs": end,
                "recognizedText": cue["text"],
            }
        )
    return {
        "schemaVersion": 1,
        "engine": f"{OCR_ENGINE}-roi-fallback",
        "device": "cpu",
        "loadSeconds": 0,
        "inferSeconds": round(time.monotonic() - started, 3),
        "cues": normalized,
    }


def parse_srt_timestamp(value: str) -> int:
    match = re.match(r"^(\d+):(\d{2}):(\d{2}),(\d{3})$", value.strip())
    if not match:
        raise RuntimeError(f"Invalid SRT timestamp: {value}")
    hours, minutes, seconds, milliseconds = [int(part) for part in match.groups()]
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds


def parse_srt(text: str) -> list[dict]:
    blocks = re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip())
    cues = []
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if len(lines) < 3:
            continue
        time_line = next((line for line in lines if "-->" in line), "")
        if not time_line:
            continue
        time_index = lines.index(time_line)
        start_raw, end_raw = [part.strip() for part in time_line.split("-->", 1)]
        start_ms = parse_srt_timestamp(start_raw)
        end_ms = parse_srt_timestamp(end_raw)
        recognized_text = normalize_ocr_text(" ".join(lines[time_index + 1 :]))
        if end_ms <= start_ms or not recognized_text:
            continue
        cues.append(
            {
                "cueId": f"cue-{len(cues) + 1:03d}",
                "startMs": start_ms,
                "endMs": end_ms,
                "recognizedText": recognized_text,
            }
        )
    return cues


def run_videosubfinder(video: Path, vsf_exe: Path, output_dir: Path) -> Path:
    if not vsf_exe or not vsf_exe.is_file():
        raise RuntimeError("VideoSubFinder executable is missing")
    vsf_dir = output_dir / "VSF_Results"
    if vsf_dir.exists():
        shutil.rmtree(vsf_dir)
    vsf_dir.mkdir(parents=True, exist_ok=True)
    command = [
        str(vsf_exe),
        "-c",
        "-r",
        "-ccti",
        "-ovocv",
        "-te",
        "0.2",
        "-be",
        "0.0",
        "-le",
        "0.0",
        "-re",
        "1.0",
        "-nthr",
        "2",
        "-nocrthr",
        "1",
        "--input_video",
        str(video),
        "--output_dir",
        str(vsf_dir),
    ]
    completed = subprocess.run(command, cwd=str(vsf_exe.parent), check=False)
    rgb_dir = vsf_dir / "RGBImages"
    if not rgb_dir.is_dir() or not any(rgb_dir.glob("*.*")):
        raise RuntimeError(
            f"VideoSubFinder did not extract subtitle key frames (exit {completed.returncode})"
        )
    return rgb_dir


def rapid_videocr_video(video: Path, vsf_exe: Path, work_dir: Path | None = None) -> dict:
    from rapid_videocr import RapidVideOCR, RapidVideOCRInput
    from rapid_videocr.export import OutputFormat

    if not video.is_file():
        raise RuntimeError(f"Video file does not exist: {video}")
    started = time.monotonic()
    output_dir = work_dir or (video.parent / ".rapid-videocr")
    output_dir.mkdir(parents=True, exist_ok=True)
    save_name = "rapid_videocr_result"
    rgb_dir = run_videosubfinder(video, vsf_exe, output_dir)
    extractor = RapidVideOCR(
        RapidVideOCRInput(is_batch_rec=True, batch_size=10, out_format=OutputFormat.SRT.value)
    )
    extractor(rgb_dir, output_dir, save_name=save_name)
    srt_path = output_dir / f"{save_name}.srt"
    if not srt_path.is_file():
        raise RuntimeError("RapidVideOCR did not write SRT")
    cues = parse_srt(srt_path.read_text(encoding="utf-8"))
    if not cues:
        return direct_rapidocr_video(video)
    return {
        "schemaVersion": 1,
        "engine": OCR_ENGINE,
        "device": "cpu",
        "loadSeconds": 0,
        "inferSeconds": round(time.monotonic() - started, 3),
        "cues": cues,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    download_parser = subparsers.add_parser("download")
    download_parser.add_argument("--model-root", required=True, type=Path)

    transcribe_parser = subparsers.add_parser("transcribe")
    transcribe_parser.add_argument("--model-root", required=True, type=Path)
    transcribe_parser.add_argument("--audio", required=True, type=Path)
    transcribe_parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps"])

    probe_parser = subparsers.add_parser("probe")
    probe_parser.add_argument("--model-root", required=True, type=Path)
    probe_parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps"])

    ocr_parser = subparsers.add_parser("ocr-video")
    ocr_parser.add_argument("--video", required=True, type=Path)
    ocr_parser.add_argument("--vsf-exe", required=True, type=Path)
    ocr_parser.add_argument("--work-dir", default=None, type=Path)

    args = parser.parse_args()
    if args.command == "download":
        download(args.model_root)
        return
    if args.command == "probe":
        probe(args.model_root, args.device)
        return
    if args.command == "ocr-video":
        result = rapid_videocr_video(args.video, args.vsf_exe, args.work_dir)
        print("OCR_RESULT_JSON=" + json.dumps(result, ensure_ascii=False), flush=True)
        return
    result = transcribe(args.model_root, args.audio, args.device)
    print("FUNASR_RESULT_JSON=" + json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FunASR runtime failed: {error}", file=sys.stderr)
        raise
