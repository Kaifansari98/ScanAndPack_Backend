/**
 * Checks if a string is a fake/dummy Indian mobile number.
 * @param number Phone number string
 * @returns { isValid: boolean; reason?: string }
 */
export function validateIndianMobileRisk(number: string, isB2B = false): { isValid: boolean; reason?: string } {
  if (isB2B) {
    return { isValid: true };
  }
  let cleanNumber = number.replace(/\D/g, "");
  
  // Strip common Indian country code (+91) / prefix (0) if they are prepended
  if (cleanNumber.startsWith("91") && cleanNumber.length === 12) {
    cleanNumber = cleanNumber.substring(2);
  } else if (cleanNumber.startsWith("0") && cleanNumber.length === 11) {
    cleanNumber = cleanNumber.substring(1);
  }

  // We only perform risk checks if it has 10 digits (common for mobile numbers)
  if (cleanNumber.length !== 10) {
    return { isValid: true }; // Pass through other lengths
  }

  // 1. All same digits (e.g., 9999999999)
  if (/^(\d)\1{9}$/.test(cleanNumber)) {
    return { isValid: false, reason: "Number cannot consist of all identical digits" };
  }

  // 2. 7 or more consecutive identical digits (e.g., 9700000000 has 8 zeros)
  const consecutiveMatch = /(\d)\1{6,}/.exec(cleanNumber);
  if (consecutiveMatch) {
    return { isValid: false, reason: `Number contains too many consecutive identical digits (${consecutiveMatch[0]})` };
  }

  // 3. 8 or more total occurrences of any single digit anywhere in the number
  const digitCounts: Record<string, number> = {};
  for (const digit of cleanNumber) {
    digitCounts[digit] = (digitCounts[digit] || 0) + 1;
    if (digitCounts[digit] >= 8) {
      return { isValid: false, reason: `Digit '${digit}' appears too many times in the number` };
    }
  }

  // 4. Standard sequential sequences
  const sequentialSequences = [
    "0123456789",
    "1234567890",
    "9876543210",
    "8765432109",
    "0987654321"
  ];
  if (sequentialSequences.includes(cleanNumber)) {
    return { isValid: false, reason: "Sequential digits are not allowed" };
  }

  // Check for general sequential order (constant +1 or -1 difference)
  let isSeqAsc = true;
  let isSeqDesc = true;
  for (let i = 0; i < cleanNumber.length - 1; i++) {
    const diff = Number(cleanNumber[i + 1]) - Number(cleanNumber[i]);
    if (diff !== 1 && !(cleanNumber[i] === "9" && cleanNumber[i + 1] === "0")) {
      isSeqAsc = false;
    }
    if (diff !== -1 && !(cleanNumber[i] === "0" && cleanNumber[i + 1] === "9")) {
      isSeqDesc = false;
    }
  }
  if (isSeqAsc || isSeqDesc) {
    return { isValid: false, reason: "Number sequence is too predictable" };
  }

  // 5. Repeating pattern loops (e.g., 9898989898)
  if (/^(\d{2})\1{4}$/.test(cleanNumber)) {
    return { isValid: false, reason: "Repeating pattern (ABABABABAB) is not allowed" };
  }

  // 6. Repeating halves (e.g., 9876598765)
  if (/^(\d{5})\1$/.test(cleanNumber)) {
    return { isValid: false, reason: "Repeating pattern (ABCDEABCDE) is not allowed" };
  }

  return { isValid: true };
}
