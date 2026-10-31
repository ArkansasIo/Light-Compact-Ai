# Encoder–decoder architecture

Light Compact AI now exposes an explicit sequence-to-sequence architecture alongside the existing decoder-only causal language model.

## Data flow

```text
Source token IDs
  -> source token + position embeddings
  -> bidirectional encoder blocks
  -> encoder memory
                         Target token IDs
                           -> target token + position embeddings
                           -> causal decoder self-attention blocks
                           -> cross-attention over encoder memory
                           -> vocabulary projection
                           -> next-token generation
```

The encoder reads the complete source sequence. The decoder uses a causal mask for target self-attention and cross-attention to condition each target position on the encoded source.

## API

Use `EncoderDecoderTransformer` from `src/encoder-decoder.ts`. Configure vocabulary size, source/target limits, model width, heads, feed-forward width, and encoder/decoder layer counts. Call `forward(sourceIds, targetIds)` for logits or `generate(sourceIds, startToken, maxTokens, endToken?)` for greedy decoding.

## Status and limitations

This is a forward-pass reference implementation. It has independently initialized parameters and is not yet connected to the existing `Trainer` reverse-mode gradient pipeline. The existing `TransformerModel` remains the trainable decoder-only baseline. Training, checkpoint integration, beam search, padding masks, dropout, and full encoder–decoder gradient propagation remain follow-up work. Do not interpret randomly initialized outputs as useful language generation.
