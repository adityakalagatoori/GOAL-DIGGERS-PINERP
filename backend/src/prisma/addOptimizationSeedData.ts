import { PrismaClient, Severity } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedOptimizationDemoData() {
  const mayfair = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000001" } });
  const oma = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000002" } });
  const woodCo = await prisma.vendor.findUniqueOrThrow({ where: { reference: "VEND-000003" } });
  const doorFrames = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000001" } });
  const lightingFrame = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000002" } });
  const diningChair = await prisma.product.findUniqueOrThrow({ where: { reference: "PROD-000007" } });

  await prisma.vendorOffer.createMany({
    data: [
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

  const existingIncidents = await prisma.vendorQualityIncident.count();
  if (existingIncidents === 0) {
    await prisma.vendorQualityIncident.createMany({
      data: [
        { vendorId: oma.id, description: "Shipment of Dining Chair components arrived 4 days late without prior notice.", severity: Severity.high },
        { vendorId: oma.id, description: "Two Lighting Frame units received with visible surface scratches.", severity: Severity.medium },
        { vendorId: oma.id, description: "Invoice quantity mismatched delivered quantity by 3 units.", severity: Severity.low },
        { vendorId: woodCo.id, description: "Door Frames batch failed dimensional tolerance check on arrival.", severity: Severity.medium },
        { vendorId: woodCo.id, description: "Delivery truck missed the scheduled dock slot, causing a half-day production delay.", severity: Severity.low },
      ],
    });
  }
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
