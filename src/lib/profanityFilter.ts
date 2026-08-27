import { Filter } from "bad-words";

const filter = new Filter();

export function containsProfanity(text: string): boolean {
  return filter.isProfane(text);
}
