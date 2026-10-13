#!/usr/bin/env python3
"""Offline, pinned DeepSeek V4.1 HF chat-template token counts; no model weights or inference calls.

Install: python3 -m pip install 'transformers==4.57.6'
Fetch tokenizer.json and chat_template.jinja from the exact HF revision shown below into a
private local directory; their SHA256 values are enforced before parsing. Input: JSON array
of Fireworks JSONL messages arrays on stdin. Output: array of {prompt,total} on stdout.
"""
import hashlib
import json
import pathlib
import sys

REVISION = '2cba9e42aa026125f3ed06c6d98c1db82f7ca027'
EXPECTED = {
    'tokenizer.json': 'c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b',
    'chat_template.jinja': 'd959d804d5101b79a49b6ff1bf3c54cd5affa9a5a78c503d925f3090040b31c3',
}


def validate_pairs(pairs):
    if not isinstance(pairs, list) or not pairs or len(pairs) > 3000000:
        raise ValueError('expected nonempty array of at most 3 million message pairs')
    for messages in pairs:
        if (not isinstance(messages, list) or len(messages) != 2 or
            any(not isinstance(m, dict) or set(m) != {'role', 'content'} for m in messages) or
            [m['role'] for m in messages] != ['user', 'assistant'] or
            any(not isinstance(m['content'], str) for m in messages)):
            raise ValueError('each pair needs only role/content: user string and assistant string, without reasoning_content')
    return pairs


def main():
    if len(sys.argv) != 2:
        raise ValueError('usage: count-deepseek-sft.py <directory containing pinned tokenizer files>')
    directory = pathlib.Path(sys.argv[1])
    for filename, digest in EXPECTED.items():
        actual = hashlib.sha256((directory / filename).read_bytes()).hexdigest()
        if actual != digest:
            raise ValueError(f'PINNED_TOKENIZER_MISMATCH: {filename} at HF {REVISION}: {actual}')
    pairs = validate_pairs(json.load(sys.stdin))
    import transformers
    if transformers.__version__ != '4.57.6':
        raise ValueError(f'TRANSFORMERS_VERSION: need 4.57.6, got {transformers.__version__}')
    from transformers import PreTrainedTokenizerFast
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_file=str(directory / 'tokenizer.json'),
        chat_template=(directory / 'chat_template.jinja').read_text(encoding='utf8'),
    )
    result = []
    for messages in pairs:
        options = dict(thinking_mode='thinking', reasoning_effort='high')
        prompt = tokenizer.apply_chat_template(messages[:1], tokenize=True, add_generation_prompt=True, **options)
        full = tokenizer.apply_chat_template(messages, tokenize=True, **options)
        if full[:len(prompt)] != prompt:
            raise ValueError('TOKEN_PREFIX_MISMATCH: cannot assign exact prompt/target counts')
        result.append({'prompt': len(prompt), 'total': len(full)})
    json.dump(result, sys.stdout, separators=(',', ':'))
    sys.stdout.write('\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'TOKENIZER_REFUSED: {error}', file=sys.stderr)
        sys.exit(1)
