import { prisma } from "./src/prisma/client";
async function main() {
  await prisma.leadProductStructureInstance.update({
    where: { id: 68 },
    data: { is_order_login_filled: false }
  });
  console.log("Updated to false");
}
main()
  .catch(console.error)
  .finally(() => process.exit(0));
