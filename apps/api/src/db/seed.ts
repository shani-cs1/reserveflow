// Demo data for LOCAL DEVELOPMENT ONLY. Safe to run repeatedly (ON CONFLICT DO NOTHING).
// Only password HASHES are stored. The plain passwords below are demo credentials.
import '../env.js';
import argon2 from 'argon2';
import { createDb, createPool } from './client.js';
import { products, users } from './schema.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = createPool(url);
const db = createDb(pool);

try {
  await db
    .insert(users)
    .values([
      {
        email: 'admin@reserveflow.local',
        passwordHash: await argon2.hash('Admin#12345'),
        role: 'ADMIN',
      },
      {
        email: 'operator@reserveflow.local',
        passwordHash: await argon2.hash('Operator#12345'),
        role: 'OPERATOR',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(products)
    .values([
      { sku: 'PUMP-001', name: 'Hydraulic Pump', unitPriceMinor: 12999, onHandQuantity: 10 },
      { sku: 'VALVE-002', name: 'Ball Valve 1"', unitPriceMinor: 2450, onHandQuantity: 50 },
      { sku: 'HOSE-003', name: 'Reinforced Hose 5m', unitPriceMinor: 3999, onHandQuantity: 3 },
    ])
    .onConflictDoNothing();

  console.log('Seed complete.');
} finally {
  await pool.end();
}
