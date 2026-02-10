import { validationResponse } from 'src/utils/validationResponse';
import { prisma } from '../../prisma/client';
import { Prisma, CutListMachineMapping } from '../../prisma/generated';




export const getAllMachines = async (
  vendor_id: number,
  user_id: number
) => {
  const machines = await prisma.machineMaster.findMany({
    where: {
      status: 'ACTIVE',
      vendor_id: vendor_id,
      userMachineMappings: {
        some: {
          user_id: user_id,
          vendor_id: vendor_id,
        },
      },
    },
    orderBy: {
      sequence_no: 'asc',
    },
    select: {
      id: true,
      machine_name: true,
      machine_code: true,
      machine_type: true,
      image_path: true,
    },
  });

  const BASE_URL = process.env.APP_URL;

  return machines.map(machine => ({
    ...machine,
    image_path: machine.image_path
      ? `${BASE_URL}/assets/track-trace/${machine.image_path}`
      : null,
  }));
};

// machine_name,machine_code,machine_type