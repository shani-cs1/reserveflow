import { getDatabase, initDatabase } from './index.ts';
import { users, products, orders, orderLines, stockAdjustments, auditEvents } from './schema.ts';
import { AuthService } from '../services/authService.ts';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.ts';
import { config } from '../config.ts';

export async function seedDatabase() {
  if (config.NODE_ENV === 'production') {
    throw new Error('Demo database seeding is disabled in production');
  }

  const db = await initDatabase();
  logger.info({ msg: 'Starting database seed...' });

  // 1. Seed Accounts
  const adminPasswordHash = await AuthService.hashPassword('AdminPass123!');
  const operatorPasswordHash = await AuthService.hashPassword('OperatorPass123!');

  const adminEmail = 'admin@reserveflow.local';
  const operatorEmail = 'operator@reserveflow.local';

  // Seed Admin
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let adminUser = existingAdmin;
  if (!adminUser) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: 'ADMIN',
        name: 'Sarah Connor (Admin)',
      })
      .returning();
    adminUser = inserted;
    logger.info({ email: adminEmail, msg: 'Seeded default ADMIN user' });
  }

  // Seed Operator
  const [existingOperator] = await db
    .select()
    .from(users)
    .where(eq(users.email, operatorEmail))
    .limit(1);

  let operatorUser = existingOperator;
  if (!operatorUser) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: operatorEmail,
        passwordHash: operatorPasswordHash,
        role: 'OPERATOR',
        name: 'Kyle Reese (Operator)',
      })
      .returning();
    operatorUser = inserted;
    logger.info({ email: operatorEmail, msg: 'Seeded default OPERATOR user' });
  }

  // 2. Seed Initial Products
  const seedProductsData = [
    {
      sku: 'PUMP-001',
      name: 'Centrifugal Water Pump 1HP High Flow',
      unitPrice: 34999, // $349.99
      onHandQuantity: 45,
      reservedQuantity: 5,
    },
    {
      sku: 'VALVE-900',
      name: 'High Pressure Brass Solenoid Valve 1/2"',
      unitPrice: 8450, // $84.50
      onHandQuantity: 120,
      reservedQuantity: 20,
    },
    {
      sku: 'MOTOR-220',
      name: 'Three-Phase Induction Motor 2.2kW',
      unitPrice: 58900, // $589.00
      onHandQuantity: 14,
      reservedQuantity: 0,
    },
    {
      sku: 'FILTER-050',
      name: 'Industrial Sediment Water Filter 5 Micron',
      unitPrice: 2200, // $22.00
      onHandQuantity: 200,
      reservedQuantity: 15,
    },
    {
      sku: 'SENSOR-420',
      name: 'Digital Pressure Transmitter 4-20mA Output',
      unitPrice: 19500, // $195.00
      onHandQuantity: 30,
      reservedQuantity: 2,
    },
    {
      sku: 'SEAL-012',
      name: 'Viton O-Ring Hydraulic Seal Kit',
      unitPrice: 1500, // $15.00
      onHandQuantity: 500,
      reservedQuantity: 0,
    },
  ];

  const productMap = new Map<string, any>();

  for (const item of seedProductsData) {
    const [existing] = await db
      .select()
      .from(products)
      .where(eq(products.sku, item.sku))
      .limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(products)
        .values(item)
        .returning();
      productMap.set(item.sku, inserted);

      // Record initial stock adjustment
      await db.insert(stockAdjustments).values({
        productId: inserted.id,
        delta: item.onHandQuantity,
        previousOnHand: 0,
        newOnHand: item.onHandQuantity,
        reason: 'Initial warehouse stocking seed',
        actorId: adminUser.id,
        actorEmail: adminUser.email,
      });

      // Audit event
      await db.insert(auditEvents).values({
        eventType: 'PRODUCT_CREATED',
        actorId: adminUser.id,
        actorEmail: adminUser.email,
        actorRole: adminUser.role,
        targetEntityType: 'PRODUCT',
        targetEntityId: inserted.id,
        requestId: 'seed_init',
        metadata: { sku: item.sku, name: item.name },
      });
    } else {
      productMap.set(item.sku, existing);
    }
  }

  // 3. Seed Sample Orders if empty
  const [existingOrder] = await db.select().from(orders).limit(1);
  if (!existingOrder && productMap.has('PUMP-001') && productMap.has('VALVE-900')) {
    const pump = productMap.get('PUMP-001')!;
    const valve = productMap.get('VALVE-900')!;

    // Create a RESERVED order
    const [order1] = await db
      .insert(orders)
      .values({
        orderNumber: 'ORD-DEMO-001',
        customerName: 'Atlas Manufacturing Co.',
        status: 'RESERVED',
        totalAmount: pump.unitPrice * 2 + valve.unitPrice * 5,
        createdBy: operatorUser.id,
        creatorEmail: operatorUser.email,
      })
      .returning();

    await db.insert(orderLines).values([
      {
        orderId: order1.id,
        productId: pump.id,
        sku: pump.sku,
        productName: pump.name,
        unitPriceSnapshot: pump.unitPrice,
        quantity: 2,
        lineTotal: pump.unitPrice * 2,
      },
      {
        orderId: order1.id,
        productId: valve.id,
        sku: valve.sku,
        productName: valve.name,
        unitPriceSnapshot: valve.unitPrice,
        quantity: 5,
        lineTotal: valve.unitPrice * 5,
      },
    ]);

    await db.insert(auditEvents).values([
      {
        eventType: 'ORDER_CREATED',
        actorId: operatorUser.id,
        actorEmail: operatorUser.email,
        actorRole: operatorUser.role,
        targetEntityType: 'ORDER',
        targetEntityId: order1.id,
        requestId: 'seed_order_1',
        metadata: { orderNumber: order1.orderNumber },
      },
      {
        eventType: 'RESERVATION_SUCCEEDED',
        actorId: operatorUser.id,
        actorEmail: operatorUser.email,
        actorRole: operatorUser.role,
        targetEntityType: 'ORDER',
        targetEntityId: order1.id,
        requestId: 'seed_order_1_res',
        metadata: { status: 'RESERVED' },
      },
    ]);

    // Create a PENDING order
    const [order2] = await db
      .insert(orders)
      .values({
        orderNumber: 'ORD-DEMO-002',
        customerName: 'Pacific Marine Works',
        status: 'PENDING',
        totalAmount: valve.unitPrice * 10,
        createdBy: operatorUser.id,
        creatorEmail: operatorUser.email,
      })
      .returning();

    await db.insert(orderLines).values([
      {
        orderId: order2.id,
        productId: valve.id,
        sku: valve.sku,
        productName: valve.name,
        unitPriceSnapshot: valve.unitPrice,
        quantity: 10,
        lineTotal: valve.unitPrice * 10,
      },
    ]);

    await db.insert(auditEvents).values({
      eventType: 'ORDER_CREATED',
      actorId: operatorUser.id,
      actorEmail: operatorUser.email,
      actorRole: operatorUser.role,
      targetEntityType: 'ORDER',
      targetEntityId: order2.id,
      requestId: 'seed_order_2',
      metadata: { orderNumber: order2.orderNumber },
    });
  }

  logger.info({ msg: 'Database seed completed successfully' });
}

// Standalone CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log('Seed finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
