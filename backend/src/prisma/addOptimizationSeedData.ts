import { PrismaClient, Severity } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Expands the base seed with everything the AI Procurement Optimization
 * Agent and its manual "pick any product" vendor-comparison lookup need to
 * have rich, non-empty results for every product in the catalog — not just
 * Wooden Legs. Safe to call repeatedly: offers use skipDuplicates, product
 * threshold updates are idempotent, and incidents are fully replaced each
 * run so re-running never silently accumulates duplicate rows.
 */
export async function seedOptimizationDemoData() {
  const mayfair = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000001" } });
  const oma = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000002" } });
  const woodCo = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000003" } });

  // Two additional vendors, purely for demo depth — richer than a 3-vendor
  // comparison on every product, and lets the "pick any product" filter
  // show up to 5 real competing quotes.
  const primeTraders = await prisma.vendor.upsert({
    where: { reference: "VEND-000004" },
    update: {},
    create: { reference: "VEND-000004", name: "Prime Traders", address: "Mumbai, MH" },
  });
  const bharatHardware = await prisma.vendor.upsert({
    where: { reference: "VEND-000005" },
    update: {},
    create: { reference: "VEND-000005", name: "Bharat Hardware", address: "Ahmedabad, GJ" },
  });

  const woodenLegs = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000003" } });
  const screws = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000004" } });
  const glassPanel = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000005" } });
  const frameClips = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000006" } });
  const doorFrames = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000001" } });
  const lightingFrame = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000002" } });
  const diningChair = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000007" } });

  // Screws and Frame Clips previously had NO reorder threshold and NO
  // vendor offers at all — dead ends for the optimization agent no matter
  // how it was triggered. Give both a real threshold so they behave like
  // every other tracked component.
  await prisma.product.update({ where: { id: screws.id }, data: { lowStockThreshold: 400 } });
  await prisma.product.update({ where: { id: frameClips.id }, data: { lowStockThreshold: 150 } });

  await prisma.vendorOffer.createMany({
    data: [
      // Wooden Legs — add the 2 new vendors on top of the existing 3 for a
      // full 5-way comparison on the demo's flagship product.
      { vendorId: primeTraders.id, productId: woodenLegs.id, unitPrice: 2.15, leadTimeDays: 5 },
      { vendorId: bharatHardware.id, productId: woodenLegs.id, unitPrice: 1.9, leadTimeDays: 9 },

      // Screws — brand new offers (product had none before).
      { vendorId: woodCo.id, productId: screws.id, unitPrice: 0.45, leadTimeDays: 3 },
      { vendorId: mayfair.id, productId: screws.id, unitPrice: 0.52, leadTimeDays: 2 },
      { vendorId: primeTraders.id, productId: screws.id, unitPrice: 0.4, leadTimeDays: 6 },
      { vendorId: bharatHardware.id, productId: screws.id, unitPrice: 0.48, leadTimeDays: 4 },

      // Frame Clips — brand new offers (product had none before).
      { vendorId: woodCo.id, productId: frameClips.id, unitPrice: 0.28, leadTimeDays: 3 },
      { vendorId: primeTraders.id, productId: frameClips.id, unitPrice: 0.25, leadTimeDays: 7 },
      { vendorId: bharatHardware.id, productId: frameClips.id, unitPrice: 0.31, leadTimeDays: 2 },

      // Glass Panel — add a 3rd vendor (previously only Mayfair + Wood Co.).
      { vendorId: oma.id, productId: glassPanel.id, unitPrice: 3.8, leadTimeDays: 6 },

      // Door Frames, Lighting Frame, Dining Chair — from a previous seed
      // pass; skipDuplicates makes re-adding them here a safe no-op.
      { vendorId: mayfair.id, productId: doorFrames.id, unitPrice: 8.5, leadTimeDays: 6 },
      { vendorId: woodCo.id, productId: doorFrames.id, unitPrice: 7.8, leadTimeDays: 11 },
      { vendorId: oma.id, productId: doorFrames.id, unitPrice: 9.2, leadTimeDays: 4 },
      { vendorId: mayfair.id, productId: lightingFrame.id, unitPrice: 3.2, leadTimeDays: 5 },
      { vendorId: oma.id, productId: lightingFrame.id, unitPrice: 2.9, leadTimeDays: 9 },
      { vendorId: woodCo.id, productId: diningChair.id, unitPrice: 9.5, leadTimeDays: 8 },
      { vendorId: mayfair.id, productId: diningChair.id, unitPrice: 10.2, leadTimeDays: 5 },
      { vendorId: oma.id, productId: diningChair.id, unitPrice: 8.9, leadTimeDays: 12 },
    ],
    skipDuplicates: true,
  });

  // Incidents are pure demo/reliability signal data (not real financial
  // records) — fully replaced on every run so re-seeding is idempotent
  // instead of accumulating duplicates.
  await prisma.vendorQualityIncident.deleteMany({});
  await prisma.vendorQualityIncident.createMany({
    data: [
      { vendorId: oma.id, description: "Shipment of Dining Chair components arrived 4 days late without prior notice.", severity: Severity.high },
      { vendorId: oma.id, description: "Two Lighting Frame units received with visible surface scratches.", severity: Severity.medium },
      { vendorId: oma.id, description: "Invoice quantity mismatched delivered quantity by 3 units.", severity: Severity.low },
      { vendorId: woodCo.id, description: "Door Frames batch failed dimensional tolerance check on arrival.", severity: Severity.medium },
      { vendorId: woodCo.id, description: "Delivery truck missed the scheduled dock slot, causing a half-day production delay.", severity: Severity.low },
      { vendorId: bharatHardware.id, description: "Screws batch had inconsistent thread sizing across the shipment.", severity: Severity.high },
      { vendorId: bharatHardware.id, description: "Packaging damaged in transit, minor surface rust on 5% of units.", severity: Severity.low },
      { vendorId: primeTraders.id, description: "Frame Clips order shipped a week later than the quoted lead time.", severity: Severity.medium },
      // Mayfair Co. intentionally has zero incidents — the clean-reliability
      // baseline the other vendors are compared against.
    ],
  });
}

// Allows `npx tsx src/prisma/addOptimizationSeedData.ts` to still work standalone.
if (require.main === module) {
  seedOptimizationDemoData()
    .then(() => console.log("Added vendor offers + quality incidents for optimization agent demo data."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
