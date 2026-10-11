# @assuredloop/search

Level 2 of `al search`, the command of
[@assuredloop/cli](https://www.npmjs.com/package/@assuredloop/cli). This
package holds a small local embedding model and the vectors of the spec
paragraphs. `al` gives it the paragraphs and the query. The package answers
with the paragraphs ranked by meaning, and `al` fuses that list with its own
full-text search. `al` itself holds no model and makes no network call.

The package is optional. Without it, `al search` answers at level 1 (full
text) and says so.

## Install

It needs Node 24 or newer. Install it beside `al`, with the same version:

    npm install --global @assuredloop/cli @assuredloop/search

Or install it in one project only:

    npm install --save-dev @assuredloop/search

`al` looks for the package in the project first, then beside itself. Run
`al search <words>`: its first line says `Level 2` and names the model.

## The model

- The model is `Xenova/bge-small-en-v1.5` (MIT), the ONNX port of
  bge-small-en-v1.5, with 8-bit weights.
- It is pinned by its revision, `ea104dacec62c0de699686887e3f920caeb4f3e3`.
- The runtime is `@huggingface/transformers` 4.3.1, pinned.
- The first search at level 2 downloads the model from Hugging Face. That
  download is the only data that leaves the machine. Later searches use the
  local copy.
- The vectors are stored beside al's index, in the repo's git folder, and are
  never committed. A changed paragraph is embedded again; a new model embeds
  everything again.

## License

MIT. See [LICENSE](LICENSE).
