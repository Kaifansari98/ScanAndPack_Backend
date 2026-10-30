/** Combined (2D + 3D) filenames have no design-type segment. */
export function nextDesignFileRevision(
  documents: Array<{ doc_og_name: string | null }>,
  designTypeSegment: string,
  structureSegment: string,
): number {
  return documents.reduce((maxRevision, doc) => {
    const match = doc.doc_og_name?.match(/^D(\d+)_(?:(2D|3D)_)?(.+)$/i);
    if (!match) return maxRevision;
    const [, revisionText, existingDesignType = "", nameBody] = match;
    if (existingDesignType.toLowerCase() !== designTypeSegment.toLowerCase()) return maxRevision;
    const isSameProductType =
      nameBody.includes(`_${structureSegment}_`) ||
      nameBody.endsWith(`_${structureSegment}`) ||
      nameBody.startsWith(`${structureSegment}_`);
    if (!isSameProductType) return maxRevision;
    const revision = Number(revisionText);
    return Number.isSafeInteger(revision) ? Math.max(maxRevision, revision) : maxRevision;
  }, -1) + 1;
}
