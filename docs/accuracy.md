# How accurate is the shelf reading?

A small, honest measurement of the shelf reader (`lib/vision.ts`, `diffShelf`) on the six sample
picture pairs the public demo page uses. Measured on 11 November 2026.

## What was tested

Each pair is one shelf before and after one visit. The reader gets the two pictures and the demo
catalogue (honey, strawberry jam, sourdough loaf, half-dozen eggs, bag of apples, bunch of flowers)
and must say which products changed in count, and by how many. It gets no reference photos, no
close-ups and no second camera: the same input the demo page sends.

| Pair | What happens between the pictures | Expected reading |
| --- | --- | --- |
| `one-jar` | One of three honey jars is removed | 1 honey |
| `two-alike` | Both egg boxes are removed | 2 eggs |
| `two-kinds` | A bag of apples and one of two bunches of flowers are removed | 1 apples, 1 flowers |
| `slid-along` | The loaf is slid about 160 px along its board and turned a little | nothing |
| `light-change` | The whole picture is 16% darker and slightly warmer | nothing |
| `gone-and-shifted` | One of three jam jars is removed and a honey jar is slid 100 px | 1 jam |

The expected readings live in `scripts/sample-truth.json`. They are not sent to the browser or to
the model. A read counts as a match only if every product and quantity is exactly right.

## How the pictures were made

They are not photographs of a real stand. `scripts/make-samples.ts` composes them: a drawn back
wall and two wooden boards, with the product cut-outs from `public/products/` placed on the boards.
Each unit gets a slightly different size and tilt, a soft shadow where it meets the board, and each
picture gets its own mild noise, so a before and after picture are never pixel-identical even where
nothing moved. Pictures are 1280 x 960 JPEGs of 105 to 135 KB.

## Results

Command: `npx tsx --env-file=.env.local scripts/eval-samples.ts`. Vision model: the default set by `VISION_MODEL` in `.env.example`.
Every pair was read twice.

| Pair | Read 1 | Read 2 | Model's own confidence |
| --- | --- | --- | --- |
| `one-jar` | 1 honey (match, 2378 ms) | 1 honey (match, 2248 ms) | 0.97 |
| `two-alike` | 2 eggs (match, 2244 ms) | 2 eggs (match, 1538 ms) | 0.97 |
| `two-kinds` | 1 apples, 1 flowers (match, 2354 ms) | 1 apples, 1 flowers (match, 2417 ms) | 0.96 |
| `slid-along` | nothing (match, 2076 ms) | nothing (match, 1967 ms) | 0.96 |
| `light-change` | nothing (match, 2048 ms) | nothing (match, 2297 ms) | 0.97 |
| `gone-and-shifted` | 1 jam (match, 2081 ms) | 1 jam (match, 2234 ms) | 0.93 |

- Exact matches: 12 of 12 reads. No read failed to return.
- The two reads of each pair agreed with each other on all 6 pairs.
- Time per read: mean 2157 ms, fastest 1538 ms, slowest 2417 ms (the model call only, from one laptop).

This was the first and only evaluation run: the pictures were not changed after seeing results.

## Limits

- Six pairs and twelve reads is a tiny sample. It shows the reader works on these cases; it does
  not give an accuracy rate for anything else.
- Composed pictures are easier than real photos. The items are sharp, evenly lit, fully visible,
  well separated, and seen straight on. There are no hands, reflections, motion blur, items hidden
  behind others, or things on the shelf that are not in the catalogue.
- The "light change" is a uniform dimming of the whole picture, not a moving shadow or a lamp
  switched on.
- The cut-outs do not match the catalogue wording exactly (the loaf has no paper bag, the apples
  are in a red net, the jam lid is plain metal). The reader still named them correctly here.
- A real stand also depends on the camera noticing a visit and choosing still frames, which this
  test does not exercise.
- Nothing here has been measured on photographs of a real shelf.
