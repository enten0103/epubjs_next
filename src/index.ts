type ReaderPage = {
  title: string;
  excerpt: string;
};

const readerPages: ReaderPage[] = [
  {
    title: "Chapter 1: Opening the Book",
    excerpt:
      "Start with a simple reader shell that proves navigation and rendering work in the browser.",
  },
  {
    title: "Chapter 2: Keeping Your Place",
    excerpt:
      "Moving between pages should update the visible content and keep the controls in sync.",
  },
  {
    title: "Chapter 3: Reaching the End",
    excerpt: "Boundary states matter too: the last page should disable forward navigation.",
  },
];

export function mountReaderApp(container: HTMLElement): void {
  let currentPageIndex = 0;

  const heading = document.createElement("h1");
  heading.textContent = "EPUB Reader Demo";

  const description = document.createElement("p");
  description.textContent = "A minimal browser test fixture for reader-style navigation.";

  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");

  const articleTitle = document.createElement("h2");
  const articleExcerpt = document.createElement("p");
  const article = document.createElement("article");
  article.append(articleTitle, articleExcerpt);

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.textContent = "Previous page";

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.textContent = "Next page";

  const controls = document.createElement("div");
  controls.append(previousButton, nextButton);

  function renderPage(): void {
    const currentPage = readerPages[currentPageIndex];
    status.textContent = `Page ${currentPageIndex + 1} of ${readerPages.length}`;
    articleTitle.textContent = currentPage.title;
    articleExcerpt.textContent = currentPage.excerpt;
    previousButton.disabled = currentPageIndex === 0;
    nextButton.disabled = currentPageIndex === readerPages.length - 1;
  }

  previousButton.addEventListener("click", () => {
    if (currentPageIndex === 0) {
      return;
    }

    currentPageIndex -= 1;
    renderPage();
  });

  nextButton.addEventListener("click", () => {
    if (currentPageIndex === readerPages.length - 1) {
      return;
    }

    currentPageIndex += 1;
    renderPage();
  });

  container.replaceChildren(heading, description, status, controls, article);
  renderPage();
}

const appRoot = document.querySelector<HTMLElement>("#app");

if (appRoot) {
  mountReaderApp(appRoot);
}
