import assert from 'node:assert/strict'
import test from 'node:test'
import { materialTranscriptToSrt, normalizeWhisperOutput, uniqueTranscriptInputs } from './materialTranscript.ts'

test('MaterialTranscript 输出标准 SRT 时间和识别原文', () => {
  const srt = materialTranscriptToSrt({
    schemaVersion: 1,
    mediaId: 'media-shot-001',
    sourceMediaPath: 'clips/shot-001.mp4',
    durationMs: 3_723_456,
    cues: [{
      cueId: 'media-shot-001-cue-001',
      mediaId: 'media-shot-001',
      startMs: 3_661_234,
      endMs: 3_723_456,
      recognizedText: '这是识别原文。',
    }],
  })
  assert.equal(srt, '1\n01:01:01,234 --> 01:02:03,456\n这是识别原文。\n')
})

test('无人声素材输出空 SRT', () => {
  assert.equal(materialTranscriptToSrt({
    schemaVersion: 1,
    mediaId: 'media-shot-001',
    sourceMediaPath: 'clips/shot-001.mp4',
    durationMs: 6000,
    cues: [],
  }), '')
})

test('共用同一视频路径的分镜只创建一个转录输入', () => {
  assert.deepEqual(uniqueTranscriptInputs([
    { index: 1, videoPath: 'clips/grok-001.mp4' },
    { index: 2, videoPath: 'clips/grok-001.mp4' },
    { index: 3, videoPath: 'clips/shot-003.mp4' },
  ]), [
    { mediaId: 'media-shot-001', videoPath: 'clips/grok-001.mp4', segmentIndexes: [1, 2] },
    { mediaId: 'media-shot-003', videoPath: 'clips/shot-003.mp4', segmentIndexes: [3] },
  ])
})

test('Whisper 秒时间转为毫秒并过滤空白、重叠和越界', () => {
  assert.deepEqual(normalizeWhisperOutput('media-shot-001', 'clips/001.mp4', {
    duration: 6,
    segments: [
      { start: 0.125, end: 2.5, text: ' 第一句 ' },
      { start: 2.4, end: 5.5, text: '第二句' },
      { start: 5.5, end: 7, text: '  ' },
    ],
  }).cues, [
    {
      cueId: 'media-shot-001-cue-001',
      mediaId: 'media-shot-001',
      startMs: 125,
      endMs: 2500,
      recognizedText: '第一句',
    },
    {
      cueId: 'media-shot-001-cue-002',
      mediaId: 'media-shot-001',
      startMs: 2500,
      endMs: 5500,
      recognizedText: '第二句',
    },
  ])
})
