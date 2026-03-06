import { prisma } from '../../prisma/client';

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



  
  return machines.map(machine => ({
    ...machine,
    image_path: machine.image_path,
  }));
};

// machine_name,machine_code,machine_type