#!/usr/bin/env python3
"""Minimal HTML -> plain text extraction (stdlib only).

Used by scripts/capture-rights-evidence.sh so that quoted clauses in the
provenance record can be grepped from a local, hash-pinned capture instead of
being retyped from memory.

Usage: html-to-text.py <input.html> > <output.txt>
"""
import html
import re
import sys
from html.parser import HTMLParser

SKIP = {"script", "style", "noscript", "svg", "head", "template", "iframe"}
BLOCK = {
    "p", "div", "section", "article", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
    "br", "hr", "table", "ul", "ol", "blockquote", "pre", "td", "th", "main", "header",
    "footer", "nav", "form", "figure", "figcaption", "dl", "dt", "dd",
}


class Extractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.title_open = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip_depth += 1
        if tag == "title":
            self.title_open = True
        if tag in BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self.skip_depth:
            self.skip_depth -= 1
        if tag == "title":
            self.title_open = False
        if tag in BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip_depth:
            return
        if self.title_open:
            self.title += data
        self.parts.append(data)


def main() -> int:
    raw = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
    # Drop HTML comments (can carry huge inline payloads / JSON blobs).
    raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    ex = Extractor()
    ex.feed(raw)
    text = "".join(ex.parts)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t\u00a0]+", " ", ln).strip() for ln in text.splitlines()]
    out = "\n".join(ln for ln in lines if ln)
    out = re.sub(r"\n{3,}", "\n\n", out)
    if ex.title.strip():
        out = "TITLE: " + re.sub(r"\s+", " ", ex.title).strip() + "\n\n" + out
    sys.stdout.write(out + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
