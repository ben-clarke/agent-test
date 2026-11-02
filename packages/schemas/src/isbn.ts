const ISBN_10_LENGTH = 10;
const ISBN_10_PATTERN = /^\d{9}[\dX]$/;
const ISBN_10_MODULUS = 11;
const ISBN_10_CHECK_X_VALUE = 10;
const ISBN_13_PATTERN = /^\d{13}$/;
const ISBN_13_PREFIX = "978";
const ISBN_13_ODD_WEIGHT = 3;
const ISBN_13_MODULUS = 10;

export const normalizeIsbn = (isbn: string): string => isbn.replace(/[-\s]/g, "").toUpperCase();

export const isValidIsbn = (normalizedIsbn: string): boolean =>
  (ISBN_10_PATTERN.test(normalizedIsbn) && hasValidIsbn10Checksum(normalizedIsbn)) ||
  (ISBN_13_PATTERN.test(normalizedIsbn) && hasValidIsbn13Checksum(normalizedIsbn));

export const toCanonicalIsbn13 = (isbn: string): string => {
  if (isbn.length !== ISBN_10_LENGTH) return isbn;
  const body = `${ISBN_13_PREFIX}${isbn.slice(0, -1)}`;
  return `${body}${calculateIsbn13CheckDigit(body)}`;
};

const calculateIsbn13CheckDigit = (body: string): number => {
  const weightedSum = body
    .split("")
    .reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : ISBN_13_ODD_WEIGHT),
      0,
    );
  return (ISBN_13_MODULUS - (weightedSum % ISBN_13_MODULUS)) % ISBN_13_MODULUS;
};

const hasValidIsbn10Checksum = (isbn: string): boolean => {
  const weightedSum = isbn
    .split("")
    .reduce(
      (sum, character, index) =>
        sum +
        (character === "X" ? ISBN_10_CHECK_X_VALUE : Number(character)) * (ISBN_10_LENGTH - index),
      0,
    );
  return weightedSum % ISBN_10_MODULUS === 0;
};

const hasValidIsbn13Checksum = (isbn: string): boolean =>
  calculateIsbn13CheckDigit(isbn.slice(0, -1)) === Number(isbn.slice(-1));
