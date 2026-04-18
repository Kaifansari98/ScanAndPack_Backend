import { generateSignedUrl } from 'src/utils/wasabiClient';
import { prisma } from '../../prisma/client';

// export const getAllMachines = async (
//   vendor_id: number,
//   user_id: number
// ) => {
//   const machines = await prisma.machineMaster.findMany({
//     where: {
//       status: 'ACTIVE',
//       vendor_id: vendor_id,
//       userMachineMappings: {
//         some: {
//           user_id: user_id,
//           vendor_id: vendor_id,
//         },
//       },
//     },
//     orderBy: {
//       sequence_no: 'asc',
//     },
//     select: {
//       id: true,
//       machine_name: true,
//       machine_code: true,
//       machine_type: true,
//       image_path: true,
//     },
//   });

//   return await Promise.all(
//     machines.map(async (machine) => ({
//       ...machine,
//       image_path: machine.image_path ? await generateSignedUrl(machine.image_path) : null,
//     }))
//   );
// };
export const getAllMachines = async (
  vendor_id: number,
  user_id: number
) => {
  // Get user's machines ordered by sequence
  const machines = await prisma.machineMaster.findMany({
    where: {
      status: 'ACTIVE',
      vendor_id: vendor_id,
      machine_type_id: {
        notIn: [17, 18],
      },
      userMachineMappings: {
        some: {
          user_id: user_id,
          vendor_id: vendor_id,
        },
      },
    },
    orderBy: { sequence_no: 'asc' },
    select: {
      id: true,
      machine_name: true,
      machine_code: true,
      machine_type: true,
      image_path: true,
      sequence_no: true,
    },
  });

  return await Promise.all(
    machines.map(async (machine) => {
      // Count items pending at this machine:
      // - mapped to this machine with actual_in_at = null (not yet scanned here)
      // - AND all previous machines (sequence_no < this machine) have been scanned (actual_in_at != null)
      //   meaning: no pending mappings exist with lower sequence_no for the same cut_list
      const pending_count = await prisma.cutListMachineMapping.count({
        where: {
          machine_id: machine.id,
          vendor_id: vendor_id,
          actual_in_at: null,
          expected_in: true,
          // cut_list has no pending mappings before this machine's sequence
          cut_list: {
            cutListMachineMapping: {
              none: {
                vendor_id: vendor_id,
                actual_in_at: null,
                sequence_no: { lt: machine.sequence_no ?? 0 },
                machine: {
                  scan_type: { not: 'PASS' },
                },
              },
            },
          },
        },
      });

      return {
        ...machine,
        sequence_no: undefined, // strip from response if not needed
        image_path: machine.image_path
          ? await generateSignedUrl(machine.image_path)
          : null,
        pending_count,
      };
    })
  );
};

