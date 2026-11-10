// Cut-out product photographs for the starter catalogue, and where each one floats in the hero.
// Positions are percentages of the hero stage, measured from the approved design.

export type ProductPhoto = { src: string; width: number; height: number };

export const PRODUCT_PHOTOS: Record<string, ProductPhoto> = {
  honey: { src: "/products/honey.png", width: 228, height: 292 },
  jam: { src: "/products/jam.png", width: 220, height: 290 },
  bread: { src: "/products/bread.png", width: 330, height: 285 },
  eggs: { src: "/products/eggs.png", width: 340, height: 320 },
  apples: { src: "/products/apples.png", width: 288, height: 322 },
  flowers: { src: "/products/flowers.png", width: 270, height: 324 },
};

export type HeroPlace = {
  /** left and top of the product, as a percentage of the stage */
  x: number;
  y: number;
  /** width as a percentage of the stage */
  w: number;
  tilt: number;
  /** seconds to offset the float, so the products don't bob in step */
  delay: number;
  /** where the name-and-price label sits */
  label: "side" | "below";
};

export const HERO_PLACES: Record<string, HeroPlace> = {
  jam: { x: 9.2, y: 17, w: 8.4, tilt: -14, delay: 0, label: "side" },
  eggs: { x: 19.8, y: 24, w: 13, tilt: 6, delay: 1.1, label: "below" },
  apples: { x: 7.6, y: 46, w: 12, tilt: -4, delay: 2.3, label: "below" },
  flowers: { x: 21.4, y: 53, w: 13.2, tilt: 8, delay: 0.6, label: "below" },
  honey: { x: 67.2, y: 31, w: 6.8, tilt: 5, delay: 1.7, label: "side" },
  bread: { x: 65.2, y: 57, w: 11, tilt: -6, delay: 2.9, label: "below" },
};
