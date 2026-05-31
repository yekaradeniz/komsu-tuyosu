export function pickContent(verses, index) {
  if (!Array.isArray(verses) || verses.length === 0) {
    throw new Error('verses array is empty');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index must be a non-negative integer');
  }
  return verses[index % verses.length];
}
