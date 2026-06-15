import { describe, expect, it } from "vitest";
import { filterImageFiles, isImageFile } from "./droppedFiles";

describe("isImageFile", () => {
  it("accepts image mime types", () => {
    expect(isImageFile(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(true);
  });

  it("accepts common extensions when mime is empty (folder drops)", () => {
    expect(isImageFile(new File([], "nested/photo.JPG", { type: "" }))).toBe(true);
    expect(isImageFile(new File([], "data.png", { type: "" }))).toBe(true);
  });

  it("rejects non-images", () => {
    expect(isImageFile(new File([], "readme.txt", { type: "text/plain" }))).toBe(false);
    expect(isImageFile(new File([], "model.pt", { type: "" }))).toBe(false);
  });
});

describe("filterImageFiles", () => {
  it("keeps only images from mixed file list", () => {
    const files = [
      new File([], "a.jpg", { type: "image/jpeg" }),
      new File([], "b.txt", { type: "text/plain" }),
      new File([], "c.webp", { type: "" }),
    ];
    expect(filterImageFiles(files).map((f) => f.name)).toEqual(["a.jpg", "c.webp"]);
  });
});
