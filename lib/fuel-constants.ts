// UK gallons: 1 litre = 0.219969 gallons (4.54609 L per gallon)
export const LITRES_TO_UK_GALLONS = 0.219969

export function litresToGallons(litres: number): number {
  return Math.round(litres * LITRES_TO_UK_GALLONS)
}
