import unittest

from runtime import split_on_long_silence


class RuntimeTest(unittest.TestCase):
    def test_splits_only_at_a_long_word_gap(self):
        self.assertEqual(
            split_on_long_silence("y 姓司子，", [[3230, 3290], [26160, 26220], [26580, 26640], [26880, 26940]]),
            [("y", 3230, 3290), ("姓司子，", 26160, 26940)],
        )
        self.assertEqual(
            split_on_long_silence("你过来。", [[100, 200], [220, 320], [340, 440]]),
            [("你过来。", 100, 440)],
        )

    def test_splits_long_subtitles_at_punctuation(self):
        text = "请问你有什么需要？来，你们这儿最帅最漂亮最有魅力的男的给我找过来。"
        unit_count = len([char for char in text if char not in "？，。"])
        timestamps = [[index * 250, index * 250 + 180] for index in range(unit_count)]
        chunks = split_on_long_silence(text, timestamps)
        self.assertGreater(len(chunks), 1)
        self.assertIn(chunks[0][0][-1], "？，。")
        self.assertTrue(all(end - start <= 5000 for _, start, end in chunks))


if __name__ == "__main__":
    unittest.main()
