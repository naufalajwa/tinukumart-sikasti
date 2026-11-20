import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Seeding script menggunakan Wrangler D1 CLI secara universal.
 * Berfungsi di OS manapun (Windows, Linux, macOS) tanpa path hardcode miniflare.
 * 
 * Penggunaan:
 * - Lokal : npx tsx src/db/seed.ts (atau npm run db:seed)
 * - Remote: npx tsx src/db/seed.ts --remote
 */
const isRemote = process.argv.includes('--remote');
const flag = isRemote ? '--remote' : '--local';
const seedSqlPath = path.resolve(process.cwd(), 'src/db/seed.sql');

console.log(`🌱 Seeding database (${isRemote ? 'REMOTE' : 'LOCAL'})...`);

try {
  execSync(`npx wrangler d1 execute sikasti-db ${flag} --file="${seedSqlPath}"`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  console.log('✅ Seeding complete!');
} catch (error) {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
}
