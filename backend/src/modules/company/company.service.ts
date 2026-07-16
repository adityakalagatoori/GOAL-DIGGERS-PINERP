import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getCompanySettings() {
  let settings = await prisma.companySettings.findFirst();
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: { companyName: "PINERP Company", currency: "INR", timezone: "Asia/Kolkata", financialYearStart: "04-01", taxPercentage: 18 },
    });
  }
  return settings;
}

export async function updateCompanySettings(data: Partial<{
  companyName: string; logoUrl: string; gstNumber: string; address: string;
  currency: string; timezone: string; financialYearStart: string; taxPercentage: number; smtpUser: string;
}>) {
  const existing = await prisma.companySettings.findFirst();
  if (existing) {
    return prisma.companySettings.update({ where: { id: existing.id }, data });
  }
  return prisma.companySettings.create({ data: { companyName: "PINERP Company", ...data } as any });
}
