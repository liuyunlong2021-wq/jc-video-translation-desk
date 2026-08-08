import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { executeFFmpeg, separateAudioStems } from './ffmpeg/index.ts'
import { runFasterWhisper } from './material-transcript.ts'
import { assertVideoTranslationSource, getRunDir, relativeRunAsset } from './media-workspace.ts'
import {
  materialTranscriptToSrt,
  normalizeWhisperOutput,
} from '../src/runtime/materialTranscript.ts'

async function hashFile(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function writeAtomic(filePath: string, content: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await fs.promises.writeFile(temporary, content, 'utf8')
  await fs.promises.rename(temporary, filePath)
}

export async function prepareVideoTranslationSpeechEvidence(
  runId: string,
  episodeId: string,
  sourceVideoPath: string,
  abortSignal?: AbortSignal,
) {
  const source = assertVideoTranslationSource(runId, episodeId, sourceVideoPath)
  const sourceFingerprint = await hashFile(source)
  const dir = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '识别')
  const sourceAudio = path.join(dir, 'source.wav')
  const vocal = path.join(dir, 'vocal.wav')
  const instrument = path.join(dir, 'instrument.wav')
  const transcriptPath = path.join(dir, 'source-whisper.json')
  const srtPath = path.join(dir, 'source-whisper.srt')
  const evidencePath = path.join(
    getRunDir(runId),
    'wiki',
    '翻译',
    episodeId,
    '00-人声识别与漏句证据.md',
  )
  const cached = await fs.promises
    .readFile(transcriptPath, 'utf8')
    .then((value) => JSON.parse(value))
    .catch(() => null)
  if (
    cached?.sourceFingerprint === sourceFingerprint &&
    (
      await Promise.all(
        [sourceAudio, vocal, instrument, srtPath, evidencePath].map((file) =>
          fs.promises.stat(file).catch(() => null),
        ),
      )
    ).every((stat) => stat?.size)
  )
    return {
      transcript: cached.transcript,
      transcriptPath: relativeRunAsset(runId, transcriptPath),
      srtPath: relativeRunAsset(runId, srtPath),
      evidencePath: relativeRunAsset(runId, evidencePath),
    }

  await fs.promises.mkdir(dir, { recursive: true })
  await executeFFmpeg(
    ['-i', source, '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-y', sourceAudio],
    { abortSignal },
  )
  await separateAudioStems(sourceAudio, vocal, instrument, abortSignal)
  const output = await runFasterWhisper(vocal, abortSignal)
  const transcript = normalizeWhisperOutput(
    'video-translation-source',
    relativeRunAsset(runId, vocal),
    output,
  )
  const evidence = `# 人声识别与漏句证据\n\n- 识别视频：[[${relativeRunAsset(runId, source)}]]\n- 分离人声：[[${relativeRunAsset(runId, vocal)}]]\n- Faster-Whisper：[[${relativeRunAsset(runId, transcriptPath)}]]\n\n## 语音区间\n\n${
    transcript.cues
      .map((cue) => `- ${cue.startMs}-${cue.endMs}ms | ${cue.recognizedText}`)
      .join('\n') || '- 无语音'
  }\n`
  await Promise.all([
    writeAtomic(
      transcriptPath,
      `${JSON.stringify({ schemaVersion: 1, sourceFingerprint, transcript }, null, 2)}\n`,
    ),
    writeAtomic(srtPath, materialTranscriptToSrt(transcript)),
    writeAtomic(evidencePath, evidence),
  ])
  return {
    transcript,
    transcriptPath: relativeRunAsset(runId, transcriptPath),
    srtPath: relativeRunAsset(runId, srtPath),
    evidencePath: relativeRunAsset(runId, evidencePath),
  }
}
