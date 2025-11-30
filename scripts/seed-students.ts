
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

const filePath = path.join(process.cwd(), 'قوائم الطلاب طب بنين 2026-2.xlsx');

async function main() {
  try {
    console.log('Reading Excel file...');
    
    console.log('Resetting Students table...');
    await prisma.student.deleteMany({});
    console.log('Students table reset.');

    const workbook = XLSX.readFile(filePath);
    const targetSheets = ['اولى', 'ثانية', 'ثالثة', 'رابعة ', 'خامسة '];
    let count = 0;
    let skipped = 0;
    
    for (const sheetName of targetSheets) {
      if (!workbook.SheetNames.includes(sheetName)) {
        console.warn(`Sheet ${sheetName} not found, skipping.`);
        continue;
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      console.log(`Processing sheet: ${sheetName}`);
      console.log(`Total rows: ${data.length}`);

      // Determine classId from sheet name
      let classId = 1;
      if (sheetName.includes('ثانية')) classId = 2;
      else if (sheetName.includes('ثالثة')) classId = 3;
      else if (sheetName.includes('رابعة')) classId = 4;
      else if (sheetName.includes('خامسة')) classId = 5;

      // Start from row 8 (index 7) as per inspection
      for (let i = 5; i < data.length; i++) {
        const row = data[i];
        
        // Check if row has enough columns and valid data
        if (!row || row.length < 6) continue;

        // Column 1 is "رقم الجلوس" (Seat Number) - matches header in Row 1
        const settingId = row[1]?.toString().trim();
        // Column 4 is Name - matches data inspection
        const name = row[4]?.toString().trim();
        
        if (!settingId || !name) continue;

        // Skip header rows or invalid data
        // Check if it looks like a seat number (e.g. "09-2025-003" or just numbers)
        if (settingId.length < 3) continue; 

        try {
          await prisma.student.upsert({
            where: { settingId },
            update: {
              name,
              classId,
              gender: 'male'
            },
            create: {
              name,
              settingId,
              classId,
              gender: 'male'
            }
          });
          count++;
          if (count % 50 === 0) console.log(`Processed ${count} students...`);
        } catch (error) {
          console.error(`Error processing row ${i} in ${sheetName}: ${name} (${settingId})`, error);
          skipped++;
        }
      }
    }

    console.log(`Seeding completed.`);
    console.log(`Successfully processed: ${count}`);
    console.log(`Skipped/Errors: ${skipped}`);

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
