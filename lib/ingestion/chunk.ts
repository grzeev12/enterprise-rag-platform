export type TextChunk = {
  content: string;
  index: number;
  tokenEstimate: number;
};

export function chunkText(text: string, chunkSize = 1200, overlap = 180): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    const end = findNaturalBoundary(normalized, start, hardEnd);
    const content = normalized.slice(start, end).trim();

    if (content) {
      chunks.push({
        content,
        index: chunks.length,
        tokenEstimate: Math.ceil(content.length / 4)
      });
    }

    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function findNaturalBoundary(text: string, start: number, hardEnd: number) {
  if (hardEnd >= text.length) return text.length;
  const window = text.slice(start, hardEnd);
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentence > Math.floor(window.length * 0.55)) {
    return start + sentence + 1;
  }
  const space = window.lastIndexOf(" ");
  return space > 0 ? start + space : hardEnd;
}
