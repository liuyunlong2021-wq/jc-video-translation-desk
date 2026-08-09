#!/usr/bin/env python3

import argparse
import json
import re
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


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    download_parser = subparsers.add_parser("download")
    download_parser.add_argument("--model-root", required=True, type=Path)

    transcribe_parser = subparsers.add_parser("transcribe")
    transcribe_parser.add_argument("--model-root", required=True, type=Path)
    transcribe_parser.add_argument("--audio", required=True, type=Path)
    transcribe_parser.add_argument("--device", default="auto", choices=["auto", "cpu", "mps"])

    args = parser.parse_args()
    if args.command == "download":
        download(args.model_root)
        return
    result = transcribe(args.model_root, args.audio, args.device)
    print("FUNASR_RESULT_JSON=" + json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FunASR runtime failed: {error}", file=sys.stderr)
        raise
