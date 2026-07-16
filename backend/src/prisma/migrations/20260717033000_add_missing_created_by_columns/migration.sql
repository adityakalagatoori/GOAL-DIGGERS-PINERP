-- schema.prisma already declares `createdBy` on SalesOrder, PurchaseOrder,
-- and ManufacturingOrder (used for ownership checks throughout the app),
-- but no migration ever created these columns — they were added to the
-- schema without running `prisma migrate dev`, so `prisma migrate deploy`
-- never applied them anywhere. Backfilling existing rows to user 1 (the
-- seeded System Administrator) matches the `createdBy: userId || 1`
-- fallback already used in every order-creation service function.

-- AlterTable
ALTER TABLE `sales_orders` ADD COLUMN `createdBy` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `purchase_orders` ADD COLUMN `createdBy` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `manufacturing_orders` ADD COLUMN `createdBy` INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `manufacturing_orders` ADD CONSTRAINT `manufacturing_orders_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
