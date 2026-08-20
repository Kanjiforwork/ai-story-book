export const SAMPLE_BOOKS = [
  {
    author: "Charles Dickens",
    id: "a-christmas-carol",
    sourceUrl: "https://www.gutenberg.org/ebooks/46",
    title: "A Christmas Carol",
  },
  {
    author: "Robert Louis Stevenson",
    id: "jekyll-and-hyde",
    sourceUrl: "https://www.gutenberg.org/ebooks/43",
    title: "The Strange Case of Dr Jekyll and Mr Hyde",
  },
] as const;

export type SampleBookId = (typeof SAMPLE_BOOKS)[number]["id"];
