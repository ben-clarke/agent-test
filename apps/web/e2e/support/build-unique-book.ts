import { randomInt, randomUUID } from "node:crypto";

export const buildUniqueBook = (): UniqueBook => {
  const isbn10Body = buildIsbn10Body();
  const isbn10 = `${isbn10Body}${calculateIsbn10CheckCharacter(isbn10Body)}`;
  const isbn13Body = `${ISBN_13_PREFIX}${isbn10Body}`;
  return {
    title: `Journey Book ${randomUUID().slice(0, UNIQUE_SUFFIX_LENGTH)}`,
    author: `Journey Author ${randomUUID().slice(0, UNIQUE_SUFFIX_LENGTH)}`,
    isbn13: `${isbn13Body}${calculateIsbn13CheckDigit(isbn13Body)}`,
    hyphenatedIsbn10: hyphenateIsbn10(isbn10),
    publishedYear: PUBLISHED_YEAR,
  };
};

const buildIsbn10Body = (): string =>
  String(randomInt(0, ISBN_BODY_RANGE)).padStart(ISBN_10_BODY_LENGTH, "0");

const calculateIsbn10CheckCharacter = (body: string): string => {
  const weightedSum = body
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (ISBN_10_LENGTH - index), 0);
  const checkValue = (ISBN_10_MODULUS - (weightedSum % ISBN_10_MODULUS)) % ISBN_10_MODULUS;
  return checkValue === ISBN_10_X_VALUE ? "X" : String(checkValue);
};

const calculateIsbn13CheckDigit = (body: string): string => {
  const weightedSum = body
    .split("")
    .reduce(
      (sum, digit, index) =>
        sum + Number(digit) * (index % 2 === 0 ? 1 : ISBN_13_ODD_POSITION_WEIGHT),
      0,
    );
  return String((ISBN_13_MODULUS - (weightedSum % ISBN_13_MODULUS)) % ISBN_13_MODULUS);
};

const hyphenateIsbn10 = (isbn10: string): string =>
  `${isbn10.slice(0, REGISTRATION_GROUP_END)}-${isbn10.slice(REGISTRATION_GROUP_END, REGISTRANT_END)}-${isbn10.slice(REGISTRANT_END, ISBN_10_BODY_LENGTH)}-${isbn10.slice(ISBN_10_BODY_LENGTH)}`;

const ISBN_13_PREFIX = "978";
const ISBN_10_BODY_LENGTH = 9;
const ISBN_10_LENGTH = ISBN_10_BODY_LENGTH + 1;
const REGISTRATION_GROUP_END = 1;
const REGISTRANT_END = 4;
const ISBN_13_ODD_POSITION_WEIGHT = 3;
const ISBN_13_MODULUS = 10;
const ISBN_BODY_RANGE = 1_000_000_000;
const ISBN_10_MODULUS = 11;
const ISBN_10_X_VALUE = 10;
const UNIQUE_SUFFIX_LENGTH = 8;
const PUBLISHED_YEAR = 1999;

export interface UniqueBook {
  readonly title: string;
  readonly author: string;
  readonly isbn13: string;
  readonly hyphenatedIsbn10: string;
  readonly publishedYear: number;
}
