import { prisma } from "../prisma/client";

const architects = [
  { name: "Alex Dean",        email: "alex.dean@archmail.com",        mobile: "9812340001" },
  { name: "Julianna Crane",   email: "julianna.crane@archmail.com",   mobile: "9812340002" },
  { name: "Fox Dennis",       email: "fox.dennis@archmail.com",       mobile: "9812340003" },
  { name: "Maisie Madden",    email: "maisie.madden@archmail.com",    mobile: "9812340004" },
  { name: "Everest Waller",   email: "everest.waller@archmail.com",   mobile: "9812340005" },
  { name: "Whitley Sierra",   email: "whitley.sierra@archmail.com",   mobile: "9812340006" },
  { name: "Dayton Sutton",    email: "dayton.sutton@archmail.com",    mobile: "9812340007" },
  { name: "Izabella Fernandez", email: "izabella.fernandez@archmail.com", mobile: "9812340008" },
  { name: "Bentley Waller",   email: "bentley.waller@archmail.com",   mobile: "9812340009" },
  { name: "Whitley Valencia", email: "whitley.valencia@archmail.com", mobile: "9812340010" },
  { name: "Dax Freeman",      email: "dax.freeman@archmail.com",      mobile: "9812340011" },
  { name: "Norah Briggs",     email: "norah.briggs@archmail.com",     mobile: "9812340012" },
  { name: "Case Benton",      email: "case.benton@archmail.com",      mobile: "9812340013" },
  { name: "Anais Valdez",     email: "anais.valdez@archmail.com",     mobile: "9812340014" },
  { name: "Kyler O'Donnell",  email: "kyler.odonnell@archmail.com",   mobile: "9812340015" },
  { name: "Bellamy Summers",  email: "bellamy.summers@archmail.com",  mobile: "9812340016" },
  { name: "Darius May",       email: "darius.may@archmail.com",       mobile: "9812340017" },
  { name: "Adriana Gomez",    email: "adriana.gomez@archmail.com",    mobile: "9812340018" },
  { name: "Isaiah Atkinson",  email: "isaiah.atkinson@archmail.com",  mobile: "9812340019" },
  { name: "Jazmin Ray",       email: "jazmin.ray@archmail.com",       mobile: "9812340020" },
  { name: "Arlo Lucas",       email: "arlo.lucas@archmail.com",       mobile: "9812340021" },
  { name: "Phoenix Hodges",   email: "phoenix.hodges@archmail.com",   mobile: "9812340022" },
  { name: "Alonzo Leon",      email: "alonzo.leon@archmail.com",      mobile: "9812340023" },
  { name: "Amora Ramsey",     email: "amora.ramsey@archmail.com",     mobile: "9812340024" },
  { name: "Luciano Gilbert",  email: "luciano.gilbert@archmail.com",  mobile: "9812340025" },
  { name: "Jocelyn Rush",     email: "jocelyn.rush@archmail.com",     mobile: "9812340026" },
  { name: "Kaiser Stout",     email: "kaiser.stout@archmail.com",     mobile: "9812340027" },
  { name: "Chana Richards",   email: "chana.richards@archmail.com",   mobile: "9812340028" },
  { name: "Holden Walsh",     email: "holden.walsh@archmail.com",     mobile: "9812340029" },
  { name: "Leia Fox",         email: "leia.fox@archmail.com",         mobile: "9812340030" },
  { name: "Antonio Graham",   email: "antonio.graham@archmail.com",   mobile: "9812340031" },
];

async function main() {
  console.log("Seeding architecture masters...");

  for (const arch of architects) {
    await (prisma.architechuremaster as any).create({
      data: {
        vendorId: 1,
        name: arch.name,
        email: arch.email,
        mobile: arch.mobile,
        isActive: true,
        createdBy: 1,
      },
    });
    console.log(`✔ Created: ${arch.name}`);
  }

  console.log(`\n✅ Done! ${architects.length} architecture masters seeded.`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
