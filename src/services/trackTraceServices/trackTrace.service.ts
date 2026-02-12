import { validationResponse } from 'src/utils/validationResponse';
import { prisma } from '../../prisma/client';
import { Prisma, CutListMachineMapping } from '../../prisma/generated';
import { CutListSavePayload } from 'src/types/track-trace';



interface TrackTracePayload {
    project_id: number;
    vendor_id: number;
    machine_id: number;
    unique_code: string;
    created_by: number;
}

export const updateScannedItem = async (payload: TrackTracePayload) => {
    const { project_id, vendor_id, machine_id, unique_code, created_by } = payload;

    //check if item is mapped to any machine
    const currentMapping =
        await prisma.cutListMachineMapping.findFirst({
            where: {
                machine_id: machine_id,
                vendor_id: vendor_id,
                project_id: project_id,
                cut_list: {
                    unique_code: unique_code,
                },
            },
            select: {
                id: true,
                sequence_no: true,
                cut_list_id: true
            },
        });

    if (!currentMapping) {
        return validationResponse(0, 'Machine mapping not found');
    }


    const nextMapping =
        await prisma.cutListMachineMapping.findFirst({
            where: {
                machine_id: machine_id,
                vendor_id: vendor_id,
                project_id: project_id,
                cut_list: {
                    unique_code: unique_code,
                },
                actual_in_at: null
            },
            select: {
                id: true,
                sequence_no: true,
                cut_list_id: true
            },
        });


    if (!nextMapping) {
        return validationResponse(0, 'Already Scanned');
    }

    const { id, sequence_no, cut_list_id } = nextMapping;
    // return currentMapping;
    // return id;


    //check if already scanned in machine

    const scanned_count = await prisma.cutListMachineMapping.count({
        where: {
            cut_list_id: cut_list_id,
            vendor_id: vendor_id,
            project_id: project_id,
            sequence_no: sequence_no,
            expected_in: true,
            actual_in_at: null,
            machine_id: machine_id

        }
    });

    //return scanned_count;


    // this item is already scanned in provided machine
    if (scanned_count == 0) {
        return validationResponse(0, 'Already Scanned');
    }



    //check if any machine is left in sequence
    const count = await prisma.cutListMachineMapping.count({
        where: {
            cut_list_id: cut_list_id,
            vendor_id: vendor_id,
            project_id: project_id,
            sequence_no: { lt: sequence_no },
            actual_in_at: null
        }
    });

    // return count;

    //No machine is left in sequence
    if (count == 0) {

        //update as scan done
        const updated = await prisma.cutListMachineMapping.update({
            where: {
                id: id,
            },
            data: {
                actual_in_at: new Date(),
                in_operator: created_by,
            },
        });
        return validationResponse(1, 'Scan done');

    } else {
        return validationResponse(0, 'Scan on other machine first');
    }







};





export const getKPIS = async (payload: TrackTraceDashboardPayload) => {

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrow = new Date(todayStart);
    tomorrow.setDate(todayStart.getDate() + 1);

    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);


    const baseWhere: any = {
        vendor_id: payload.vendor_id,
        actual_in_at: {
            gte: todayStart,
            lte: tomorrow,
        },
    };

    console.log("payload.project_id", payload.project_id);
    if (payload.project_id) {
        baseWhere.project_id = Number(payload.project_id);
    }

    if (payload.machine_id) {
        baseWhere.machine_id = Number(payload.machine_id);
    }

    if (payload.created_by) {
        baseWhere.operator = Number(payload.created_by);
    }




    const itemsToday = await prisma.cutListMachineMapping.count({
        where: baseWhere,
    });



    // where: {
    //             vendor_id: payload.vendor_id,
    //             actual_in_at: {
    //                 gte: todayStart,
    //                 lte: tomorrow,
    //             },
    //         },
    const processedItemsToday = await prisma.cutListMachineMapping.findMany({
        where: baseWhere,
        select: {
            cut_list: {
                select: {
                    length: true,
                    width: true,
                },
            },
        },
    });

    const totalSqft = Math.round(
        processedItemsToday.reduce((sum, item) => {
            const length = Number(item.cut_list?.length ?? 0);
            const width = Number(item.cut_list?.width ?? 0);
            return sum + (length * width) / 92903;
        }, 0) * 100
    ) / 100;



    const baseWhereYesterday: any = {
        vendor_id: payload.vendor_id,
        actual_in_at: {
            gte: yesterdayStart,
            lte: todayStart,
        },
    };

    console.log("payload.project_id", payload.project_id);
    if (payload.project_id) {
        baseWhereYesterday.project_id = Number(payload.project_id);
    }

    if (payload.machine_id) {
        baseWhereYesterday.machine_id = Number(payload.machine_id);
    }

    if (payload.created_by) {
        baseWhereYesterday.operator = Number(payload.created_by);
    }

    const processedItemsYesterday = await prisma.cutListMachineMapping.findMany({
        where: baseWhereYesterday,
        select: {
            cut_list: {
                select: {
                    length: true,
                    width: true,
                },
            },
        },
    });

    const yesterdaySqft = Math.round(
        processedItemsYesterday.reduce((sum, item) => {
            const length = Number(item.cut_list?.length ?? 0);
            const width = Number(item.cut_list?.width ?? 0);
            return sum + (length * width) / 92903;
        }, 0) * 100
    ) / 100;


    const sqftChange =
        yesterdaySqft > 0
            ? Math.round(((totalSqft - yesterdaySqft) / yesterdaySqft) * 100)
            : 0;

    const sqftTrend = totalSqft >= yesterdaySqft ? 'up' : 'down';

    const sqftSubtitle = `${sqftTrend === 'up' ? '↑' : '↓'} ${Math.abs(
        totalSqft - yesterdaySqft
    ).toFixed(2)} sqft`;


    const itemsYesterday = await prisma.cutListMachineMapping.count({
        where: baseWhereYesterday,
    });

    const itemsChange = itemsYesterday > 0
        ? Math.round(((itemsToday - itemsYesterday) / itemsYesterday) * 100)
        : 0;

    const totalMachines = await prisma.machineMaster.count({
        where: {
            vendor_id: payload.vendor_id, // or just vendor_id if variable name matches
        },
    });
    const activeMachines = await prisma.machineMaster.count({
        where: {
            status: 'ACTIVE',
            vendor_id: payload.vendor_id
        }
    });

    const machineUtilization = totalMachines > 0
        ? Math.round((activeMachines / totalMachines) * 100)
        : 0;

    const totalOperators = await prisma.userMaster.count({
        where: {
            status: 'active',
            vendor_id: payload.vendor_id
        }
    });

    const activeOperatorGroups = await prisma.userMachineMapping.groupBy({
        by: ['user_id'],
        where: {
            status: 'ACTIVE',
            vendor_id: payload.vendor_id,
        },
    });

    const activeOperatorMappings = activeOperatorGroups.length;

    const operatorAvailability = totalOperators > 0
        ? Math.round((activeOperatorMappings / totalOperators) * 100)
        : 0;

    return {
        totalItemsProcessed: {
            value: itemsToday,
            change: `${itemsChange >= 0 ? '+' : ''}${itemsChange}% vs yesterday`,
            subtitle: `${itemsChange >= 0 ? '↑' : '↓'} ${Math.abs(itemsToday - itemsYesterday)}`,
            trend: itemsChange >= 0 ? 'up' : 'down',
            sqft: {
                value: totalSqft,
                change: `${sqftChange >= 0 ? '+' : ''}${sqftChange}% vs yesterday`,
                subtitle: sqftSubtitle,
                trend: sqftTrend,
            },

        },
        activeMachines: {
            value: `${activeMachines}/${totalMachines}`,
            change: `${machineUtilization}% utilization`,
            subtitle: `${totalMachines - activeMachines} idle`,
            trend: 'neutral',
        },
        activeOperators: {
            value: `${activeOperatorMappings}/${totalOperators}`,
            change: `${operatorAvailability}% availability`,
            subtitle: `${totalOperators - activeOperatorMappings} available`,
            trend: 'neutral',
        },
    };


};


export const getRealTimeItemTracking = async (payload: TrackTraceDashboardPayload) => {

    // const searchParams = request.nextUrl.searchParams;
    const project = payload.project_id;
    const machine = payload.machine_id;
    const operator = payload.created_by;
    const vendor_id = payload.vendor_id;


    const baseWhere: any = {
        vendor_id: vendor_id,
        actual_in_at: {
            not: null,
        },
    };

    console.log("payload.project_id", payload.project_id);
    if (payload.project_id) {
        baseWhere.project_id = Number(payload.project_id);
    }

    if (payload.machine_id) {
        baseWhere.machine_id = Number(payload.machine_id);
    }

    if (payload.created_by) {
        baseWhere.operator = Number(payload.created_by);
    }



    const result = await prisma.cutListMachineMapping.findMany({
        where: baseWhere,
        select: {
            id: true,
            actual_in_at: true,
            sequence_no: true,

            cut_list: {
                select: {
                    item_name: true,
                    material_details: true,
                    description: true,
                },
            },

            machine: {
                select: {
                    machine_name: true,
                    image_path: true,
                },
            },

            operator: {
                select: {
                    user_name: true,
                },
            },

            project: {
                select: {
                    project_name: true,
                },
            },

            lead: {
                select: {
                    lead_code: true,
                },
            },
        },
        orderBy: {
            actual_in_at: 'desc',
        },
        take: 10,
    });


    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formattedResult = result.map(item => {
        const date = new Date(item.actual_in_at ?? new Date());
        const isToday = date >= today;

        const formattedDate = isToday
            ? date.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            })
            : date.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: '2-digit',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });

        return {
            ...item,
            actual_in_at_formatted: formattedDate,
        };
    });

    return formattedResult;



};




export const getMachineStatus1 = async (payload: TrackTraceDashboardPayload) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

        const machines = await prisma.machineMaster.findMany({
            include: {
                userMachineMappings: {
                    where: {
                        status: 'ACTIVE'
                    },
                    include: {
                        user: {
                            select: {
                                user_name: true,
                                id: true
                            }
                        }
                    },
                    take: 1
                }
            },
            orderBy: {
                machine_name: 'asc'
            }
        });

        // Calculate utilization for each machine
        const machinesWithUtilization = await Promise.all(
            machines.map(async (machine) => {
                // Get all scans for this machine today, ordered by time
                const todayScans = await prisma.cutListMachineMapping.findMany({
                    where: {
                        machine_id: machine.id,
                        actual_in_at: {
                            gte: todayStart
                        }
                    },
                    orderBy: {
                        actual_in_at: 'asc'
                    },
                    select: {
                        id: true,
                        actual_in_at: true,
                        cut_list_id: true,
                    }
                });

                // Calculate active time by pairing IN and OUT scans
                let totalActiveSeconds = 0;
                const itemSessions = new Map<string, Date>(); // cutListId -> last IN time

                for (const scan of todayScans) {
                    const timestamp = scan.actual_in_at;
                    if (timestamp != null) {
                        itemSessions.set(String(scan.cut_list_id), timestamp);
                    }
                }

                // Add time for items currently in process (IN but not OUT yet)
                const now = new Date();
                itemSessions.forEach((startTime) => {
                    const duration = (now.getTime() - startTime.getTime()) / 1000;
                    totalActiveSeconds += duration;
                });

                // Calculate utilization
                const workingSeconds = 8 * 60 * 60; // 8 hours
                const utilization = machine.status === 'MAINTENANCE' || machine.status === 'INACTIVE'
                    ? 0
                    : Math.min(Math.round((totalActiveSeconds / workingSeconds) * 100), 100);

                // Check if currently processing (has items with IN scan but no matching OUT)
                const currentlyProcessing = itemSessions.size > 0;

                // Count completed items today (items that have both IN and OUT scans)
                const completedItems = await prisma.cutListMachineMapping.groupBy({
                    by: ['cut_list_id'],
                    where: {
                        machine_id: machine.id,
                        actual_in_at: {
                            gte: todayStart
                        }
                    }
                });

                const operator = machine.userMachineMappings[0]?.user
                    ? `${machine.userMachineMappings[0].user.user_name}`
                    : undefined;

                return {
                    id: machine.id,
                    name: machine.machine_name,
                    status: currentlyProcessing && machine.status === 'ACTIVE'
                        ? 'ACTIVE'
                        : machine.status === 'ACTIVE'
                            ? 'IDLE'
                            : machine.status,
                    operator,
                    utilization,
                    itemsProcessedToday: completedItems.length
                };
            })
        );

        machinesWithUtilization.sort(
            (a, b) => b.utilization - a.utilization
        );
        return machinesWithUtilization;
    } catch (error) {
        console.error('Error fetching machines:', error);
    }
};


export const getHourlyProduction1 = async (payload: TrackTraceDashboardPayload) => {

    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const hours = [];
        const labels = [];
        const data = [];

        for (let hour = 8; hour <= 20; hour++) {
            const hourStart = new Date(todayStart);
            hourStart.setHours(hour, 0, 0, 0);

            const hourEnd = new Date(todayStart);
            hourEnd.setHours(hour + 1, 0, 0, 0);

            const count = await prisma.cutListMachineMapping.count({
                where: {
                    actual_in_at: {
                        gte: hourStart,
                        lt: hourEnd,
                        not: null
                    }
                }
            });

            const hourLabel = hour === 12
                ? '12 PM'
                : hour > 12
                    ? `${hour - 12} PM`
                    : `${hour} AM`;

            labels.push(hourLabel);
            data.push(count);
        }

        // Target is 60 items per hour
        const target = new Array(labels.length).fill(60);

        return {
            labels,
            datasets: [
                {
                    label: 'Items Processed',
                    data,
                    borderColor: '#111827',
                    backgroundColor: 'rgba(17, 24, 39, 0.1)',
                },
                {
                    label: 'Target',
                    data: target,
                    borderColor: '#9CA3AF',
                    backgroundColor: 'transparent',
                }
            ]
        };
    } catch (error) {
        console.error('Error fetching hourly production:', error);
    }
};

export const getHourlyProduction = async (
    payload: TrackTraceDashboardPayload
) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

        const labels: string[] = [];
        const data: number[] = [];

        for (let hour = 8; hour <= 20; hour++) {
            const hourStart = new Date(todayStart);
            hourStart.setHours(hour, 0, 0, 0);

            const hourEnd = new Date(todayStart);
            hourEnd.setHours(hour + 1, 0, 0, 0);


            const baseWhere: any = {
                vendor_id: payload.vendor_id,
                actual_in_at: {
                    gte: hourStart,
                    lt: hourEnd,
                    not: null,
                },
            };

            if (payload.project_id) {
                baseWhere.project_id = Number(payload.project_id);
            }

            if (payload.machine_id) {
                baseWhere.machine_id = Number(payload.machine_id);
            }

            if (payload.created_by) {
                baseWhere.operator = Number(payload.created_by);
            }

            const scans = await prisma.cutListMachineMapping.findMany({
                where: baseWhere,
                include: {
                    cut_list: {
                        select: {
                            length: true,
                            width: true,
                        },
                    },
                },
            });

            let sqftThisHour = 0;

            for (const scan of scans) {
                if (!scan.cut_list) continue;

                const sqft =
                    (Number(scan.cut_list.length) * Number(scan.cut_list.width)) / 92903;

                sqftThisHour += sqft;
            }

            const hourLabel =
                hour === 12
                    ? '12 PM'
                    : hour > 12
                        ? `${hour - 12} PM`
                        : `${hour} AM`;

            labels.push(hourLabel);
            data.push(Math.round(sqftThisHour * 100) / 100);
        }

        // Example target: 500 sqft per hour
        const targetSqftPerHour = 500;
        const target = new Array(labels.length).fill(targetSqftPerHour);

        return {
            labels,
            datasets: [
                {
                    label: 'SQFT Processed',
                    data,
                    borderColor: '#111827',
                    backgroundColor: 'rgba(17, 24, 39, 0.1)',
                },
                {
                    label: 'Target SQFT',
                    data: target,
                    borderColor: '#9CA3AF',
                    backgroundColor: 'transparent',
                    borderDash: [6, 6],
                },
            ],
        };
    } catch (error) {
        console.error('Error fetching hourly production:', error);
        throw error;
    }
};


export const getMachineUtilization1 = async (payload: TrackTraceDashboardPayload) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

        // Get all machines
        const machines = await prisma.machineMaster.findMany({
            select: {
                id: true,
                machine_name: true,
                status: true
            }
        });

        // Group machines by type (extracted from name)
        const machineTypes = new Map<string, { total: number; active: number }>();

        for (const machine of machines) {
            // Extract type from name (e.g., "CNC Router #1" -> "CNC Router")
            const typeMatch = machine.machine_name.match(/^(.*?)\s*#?\d*$/);
            const type = typeMatch ? typeMatch[1].trim() : machine.machine_name;

            if (!machineTypes.has(type)) {
                machineTypes.set(type, { total: 0, active: 0 });
            }

            const stats = machineTypes.get(type)!;

            // Get all scans for this machine today
            const scans = await prisma.cutListMachineMapping.findMany({
                where: {
                    machine_id: machine.id,
                    actual_in_at: {
                        gte: todayStart
                    }
                },
                orderBy: {
                    actual_in_at: 'asc'
                },
                select: {
                    cut_list_id: true,
                    actual_in_at: true,
                    actual_out_at: true,
                    created_at: true
                }
            });

            // Calculate active time by pairing IN and OUT scans
            const itemSessions = new Map<string, Date>();
            let activeSeconds = 0;

            for (const scan of scans) {
                // Use actual_in_at if available, otherwise created_at
                const timestamp = scan.actual_in_at || scan.created_at;

                itemSessions.set(String(scan.cut_list_id), timestamp);
            }

            // Add time for items currently in process (IN but not OUT yet)
            const now = new Date();
            itemSessions.forEach((startTime) => {
                const duration = (now.getTime() - startTime.getTime()) / 1000;
                activeSeconds += duration;
            });

            // Calculate utilization
            const workingSeconds = 8 * 60 * 60; // 8 hours
            const utilization = machine.status === 'MAINTENANCE' || machine.status === 'INACTIVE'
                ? 0
                : Math.min(Math.round((activeSeconds / workingSeconds) * 100), 100);

            stats.total += utilization;
            stats.active += 1;
        }

        // Calculate average utilization per type
        const labels: string[] = [];
        const data: number[] = [];
        const colors: string[] = [];

        const colorPalette = [
            '#111827', '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF'
        ];

        let colorIndex = 0;
        machineTypes.forEach((stats, type) => {
            labels.push(type);
            const avgUtilization = stats.active > 0
                ? Math.round(stats.total / stats.active)
                : 0;
            data.push(avgUtilization);
            colors.push(colorPalette[colorIndex % colorPalette.length]);
            colorIndex++;
        });

        return {
            labels,
            datasets: [
                {
                    label: 'Utilization %',
                    data,
                    backgroundColor: colors,
                }
            ]
        };
    } catch (error) {
        console.error('Error fetching machine utilization:', error);
        throw new Error('Failed to fetch machine utilization data');
    }
};


export const getMachineUtilization = async (
    payload: TrackTraceDashboardPayload
) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const now = new Date();

        // configurable benchmark (important)
        const WORKING_SECONDS = 8 * 60 * 60;
        const EXPECTED_SQFT_PER_MACHINE = 500; // tune per factory


        const baseWhere: any = {
            vendor_id: payload.vendor_id,
        };

        // if (payload.project_id) {
        //     baseWhere.project_id = Number(payload.project_id);
        // }

        if (payload.machine_id) {
            baseWhere.id = Number(payload.machine_id);
        }

        // if (payload.created_by) {
        //     baseWhere.operator = Number(payload.created_by);
        // }


        const machines = await prisma.machineMaster.findMany({
            where: baseWhere,
            select: {
                id: true,
                machine_name: true,
                status: true,
            },
        });

        console.log("=============");
        console.log(machines)

        const machineTypes = new Map<
            string,
            { weightedSeconds: number; count: number }
        >();

        for (const machine of machines) {
            const typeMatch = machine.machine_name.match(/^(.*?)\s*#?\d*$/);
            const type = typeMatch ? typeMatch[1].trim() : machine.machine_name;

            if (!machineTypes.has(type)) {
                machineTypes.set(type, { weightedSeconds: 0, count: 0 });
            }

            if (machine.status !== 'ACTIVE') continue;

            const scans = await prisma.cutListMachineMapping.findMany({
                where: {
                    machine_id: machine.id,
                    actual_in_at: { gte: todayStart },
                },
                orderBy: { actual_in_at: 'asc' },
                include: {
                    cut_list: {
                        select: {
                            length: true,
                            width: true,
                        },
                    },
                },
            });

            //   console.log(scans);

            let weightedActiveSeconds = 0;

            for (let i = 0; i < scans.length; i++) {
                const current = scans[i];
                const next = scans[i + 1];

                if (!current.actual_in_at || !current.cut_list) continue;

                const start = current.actual_in_at;
                const end = next?.actual_in_at ?? now;

                const durationSeconds =
                    (end.getTime() - start.getTime()) / 1000;

                const sqft =
                    (Number(current.cut_list.length) * Number(current.cut_list.width)) / 92903;

                weightedActiveSeconds += durationSeconds * sqft;
                // console.log(weightedActiveSeconds);
            }

            const stats = machineTypes.get(type)!;
            stats.weightedSeconds += weightedActiveSeconds;
            stats.count += 1;
        }

        const labels: string[] = [];
        const data: number[] = [];
        const colors: string[] = [];

        const colorPalette = [
            '#111827',
            '#1F2937',
            '#374151',
            '#4B5563',
            '#6B7280',
            '#9CA3AF',
        ];

        let colorIndex = 0;


        machineTypes.forEach((stats, type) => {
            const maxWeightedSeconds =
                WORKING_SECONDS * EXPECTED_SQFT_PER_MACHINE * stats.count;

            const utilization =
                maxWeightedSeconds > 0
                    ? Math.min(
                        Math.round(
                            (stats.weightedSeconds / maxWeightedSeconds) * 100
                        ),
                        100
                    )
                    : 0;

            labels.push(type);
            data.push(utilization);
            colors.push(colorPalette[colorIndex % colorPalette.length]);
            colorIndex++;
        });

        // console.log(data)

        return {
            labels,
            datasets: [
                {
                    label: 'SQFT Weighted Utilization %',
                    data,
                    backgroundColor: colors,
                },
            ],
        };
    } catch (error) {
        console.error('Error fetching machine utilization:', error);
        throw new Error('Failed to fetch machine utilization data');
    }
};


export const getMachineStatus = async (payload: TrackTraceDashboardPayload) => {
    try {
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const now = new Date();



        const baseWhere: any = {
            vendor_id: payload.vendor_id,
            status: 'ACTIVE'
        };

        // if (payload.project_id) {
        //     baseWhere.project_id = Number(payload.project_id);
        // }

        // const machineWhere: any = {
        //     payload.machine_id;
        // };

        if (payload.machine_id) {
            baseWhere.id = Number(payload.machine_id);
        }

        if (payload.created_by) {
            baseWhere.operator = Number(payload.created_by);
        }

        const baseWhereMachine: any = {
            vendor_id: payload.vendor_id,
            status: 'ACTIVE'
        };

        if (payload.machine_id) {
            baseWhereMachine.id = Number(payload.machine_id);
        }




        console.log("baseWhere", baseWhere);
        const machines = await prisma.machineMaster.findMany({
            where: baseWhereMachine,
            include: {
                userMachineMappings: {
                    where: baseWhere,
                    include: {
                        user: { select: { user_name: true, id: true } }
                    },
                    take: 1
                }
            },
            orderBy: { machine_name: 'asc' }
        });






        // if (payload.project_id) {
        //     baseWhere.project_id = Number(payload.project_id);
        // }

        // const machineWhere: any = {
        //     payload.machine_id;
        // };

        if (payload.machine_id) {
            baseWhere.id = Number(payload.machine_id);
        }

        if (payload.created_by) {
            baseWhere.operator = Number(payload.created_by);
        }



        const machinesWithMetrics = await Promise.all(
            machines.map(async (machine) => {

                const baseWhereMatrics: any = {
                    vendor_id: payload.vendor_id,
                    machine_id: machine.id,
                    actual_in_at: { gte: todayStart }
                };

                if (payload.project_id) {
                    baseWhereMatrics.project_id = Number(payload.project_id);
                }


                if (payload.machine_id) {
                    baseWhereMatrics.id = Number(payload.machine_id);
                }

                if (payload.created_by) {
                    baseWhereMatrics.operator = Number(payload.created_by);
                }

                const scans = await prisma.cutListMachineMapping.findMany({
                    where: baseWhereMatrics,
                    orderBy: { actual_in_at: 'asc' },
                    include: {
                        cut_list: {
                            select: {
                                id: true,
                                length: true,
                                width: true
                            }
                        }
                    }
                });

                let totalActiveSeconds = 0;
                let sqftProcessedToday = 0;
                let sqftInProcess = 0;

                for (let i = 0; i < scans.length; i++) {
                    const current = scans[i];
                    const next = scans[i + 1];

                    if (!current.actual_in_at || !current.cut_list) continue;

                    const start = current.actual_in_at;
                    const end = next?.actual_in_at ?? now;

                    const durationSeconds =
                        (end.getTime() - start.getTime()) / 1000;

                    totalActiveSeconds += durationSeconds;

                    const sqft =
                        (Number(current.cut_list.length) * Number(current.cut_list.width)) / 92903;

                    if (next) {
                        sqftProcessedToday += sqft;
                    } else {
                        sqftInProcess += sqft;
                    }
                }

                const workingSeconds = 8 * 60 * 60;

                const utilization =
                    machine.status !== 'ACTIVE'
                        ? 0
                        : Math.min(
                            Math.round((totalActiveSeconds / workingSeconds) * 100),
                            100
                        );

                const operator = machine.userMachineMappings[0]?.user?.user_name;

                return {
                    id: machine.id,
                    name: machine.machine_name,
                    status:
                        sqftInProcess > 0 && machine.status === 'ACTIVE'
                            ? 'ACTIVE'
                            : machine.status === 'ACTIVE'
                                ? 'IDLE'
                                : machine.status,
                    operator,
                    utilization,
                    sqftProcessedToday: Math.round(sqftProcessedToday * 100) / 100,
                    sqftInProcess: Math.round(sqftInProcess * 100) / 100
                };
            })
        );

        return machinesWithMetrics.sort(
            (a, b) => b.utilization - a.utilization
        );
    } catch (error) {
        console.error('Error fetching machines:', error);
        throw error;
    }
};



export const getTopPerformer = async (payload: TrackTraceDashboardPayload) => {
    try {
        // Get today's start
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));


        const baseWhere: any = {
            status: 'ACTIVE',
            vendor_id: payload.vendor_id,
        };

        // if (payload.project_id) {
        //     baseWhere.project_id = Number(payload.project_id);
        // }

        if (payload.machine_id) {
            baseWhere.machine_id = Number(payload.machine_id);
        }

        // if (payload.created_by) {
        //     baseWhere.operator = Number(payload.created_by);
        // }

        // Get all active user-machine mappings
        const userMappings = await prisma.userMachineMapping.findMany({
            where: baseWhere,
            include: {
                user: {
                    select: {
                        id: true,
                        user_name: true,
                    }
                },
                machine: {
                    select: {
                        id: true,
                        machine_name: true
                    }
                }
            }
        });

        const operatorPerformance = await Promise.all(
            userMappings.map(async (mapping) => {
                // Get all items scanned on this machine today
                const scannedItems = await prisma.cutListMachineMapping.findMany({
                    where: {
                        machine_id: mapping.machine_id,
                        actual_in_at: {
                            gte: todayStart,
                            not: null
                        }
                    },
                    orderBy: {
                        actual_in_at: 'asc'
                    },
                    select: {
                        cut_list_id: true,
                        actual_in_at: true,
                    }
                });

                const itemsProcessed = scannedItems.length;

                // Calculate average time between scans (throughput rate)
                let totalGapSeconds = 0;
                for (let i = 1; i < scannedItems.length; i++) {
                    const gap = (scannedItems[i].actual_in_at!.getTime() - scannedItems[i - 1].actual_in_at!.getTime()) / 1000;
                    totalGapSeconds += gap;
                }

                const avgTimeSeconds = scannedItems.length > 1
                    ? totalGapSeconds / (scannedItems.length - 1)
                    : 0;
                const avgTimeMinutes = Math.round(avgTimeSeconds / 60 * 10) / 10;

                // Calculate efficiency based on throughput
                // Target: 1 item every 10 minutes (6 items per hour)
                const targetTimeSeconds = 10 * 60;
                const efficiency = avgTimeSeconds > 0
                    ? Math.min(Math.round((targetTimeSeconds / avgTimeSeconds) * 100), 100)
                    : 0;

                return {
                    id: mapping.user_id,
                    name: `${mapping.user.user_name}`,
                    machine: mapping.machine.machine_name,
                    itemsProcessed,
                    avgTime: itemsProcessed > 1 ? `${avgTimeMinutes}m` : '-',
                    efficiency: itemsProcessed > 1 ? efficiency : 0
                };
            })
        );

        const sortedOperators = operatorPerformance
            .filter(op => op.itemsProcessed > 0)
            .sort((a, b) => b.itemsProcessed - a.itemsProcessed)
            .slice(0, 10);


        return sortedOperators;
    } catch (error) {
        console.error('Error fetching operator performance:', error);

    }
};



export const getProjectProgress = async (payload: TrackTraceDashboardPayload) => {
    try {

        const result = await prisma.$queryRaw<
            {
                item_name: string;
                lead_code: string;
                project_name: string;
                processed: number;
                pending: number;
                sqft_processed: number;
                sqft_pending: number;

            }[]
        >`
SELECT
    cl.item_name,
    lm.lead_code,
    pm.project_name,
    COUNT(clmm.id) FILTER (WHERE clmm.actual_in_at IS NOT NULL)::INT AS processed,
    COUNT(clmm.id) FILTER (WHERE clmm.actual_in_at IS NULL)::INT     AS pending,
    (
      SUM(cl.length * cl.width) 
      FILTER (WHERE clmm.actual_in_at IS NOT NULL) 
      / 92903
    )::INT AS sqft_processed,
	(
      SUM(cl.length * cl.width) 
      FILTER (WHERE clmm.actual_in_at IS NULL) 
      / 92903
    )::INT AS sqft_pending
FROM public."CutList" cl
INNER JOIN public."CutListMachineMapping" clmm ON clmm.cut_list_id = cl.id
INNER JOIN public."ProjectMaster" pm ON clmm.project_id = pm.id
INNER JOIN public."LeadMaster" lm ON clmm.lead_id = lm.id
WHERE clmm.vendor_id = ${payload.vendor_id}
GROUP BY
    cl.item_name,
    lm.lead_code,
    pm.project_name
`;


        const enrichedResult = result.map(item => {
            const total = item.pending + item.processed;
            const progress =
                total > 0
                    ? Math.round((item.processed / total) * 100)
                    : 0;

            const total_sqft = item.sqft_pending + item.sqft_processed;
            const progress_sqft =
                total > 0
                    ? Math.round((item.sqft_processed / total_sqft) * 100)
                    : 0;

            return {
                ...item,
                total,
                progress, // percentage
                progress_sqft
            };
        });




        return enrichedResult;


    } catch (error) {
        console.error('Error fetching projects:', error);

    }
}

export const getBottleNeck = async (payload: TrackTraceDashboardPayload) => {
    try {
        const machines = await prisma.machineMaster.findMany({
            where: {
                status: {
                    in: ['ACTIVE']
                },
                vendor_id: payload.vendor_id
            },
            include: {
                userMachineMappings: {
                    where: {
                        status: 'ACTIVE',
                        vendor_id: payload.vendor_id
                    },
                    include: {
                        user: {
                            select: {
                                user_name: true,
                            }
                        }
                    },
                    take: 1
                },
                cutListMachineMapping: {
                    where: {
                        actual_in_at: null  // Items not yet completed (queued items)
                    },
                    include: {
                        cut_list: true
                    }
                }
            }
        });

        const bottlenecks = await Promise.all(
            machines.map(async (machine) => {
                // Queue count = items not yet completed
                const queueCount = machine.cutListMachineMapping.length;

                // Get recent scans to calculate average processing rate
                const recentScans = await prisma.cutListMachineMapping.findMany({
                    where: {
                        machine_id: machine.id,
                        actual_in_at: {
                            not: null,
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                        }
                    },
                    orderBy: {
                        actual_in_at: 'asc'
                    },
                    select: {
                        actual_in_at: true,
                    },
                    take: 20
                });

                let avgWaitMinutes = 10; // Default: 10 minutes per item

                // Calculate average time between scans (processing rate)
                if (recentScans.length > 1) {
                    let totalGapSeconds = 0;
                    for (let i = 1; i < recentScans.length; i++) {
                        const gap = (recentScans[i].actual_in_at!.getTime() - recentScans[i - 1].actual_in_at!.getTime()) / 1000;
                        totalGapSeconds += gap;
                    }
                    avgWaitMinutes = Math.round((totalGapSeconds / (recentScans.length - 1)) / 60);
                }

                const avgWait = avgWaitMinutes >= 60
                    ? `${Math.round(avgWaitMinutes / 60)}h ${avgWaitMinutes % 60}m`
                    : `${avgWaitMinutes}m`;

                // Estimate total wait time for queue
                const estimatedWaitMinutes = avgWaitMinutes * queueCount;

                // Determine severity based on queue size and estimated wait
                let severity: 'high' | 'medium' | 'low';
                let percentage: number;

                if (queueCount > 20 || estimatedWaitMinutes > 120) {
                    severity = 'high';
                    percentage = Math.min(100, Math.round((estimatedWaitMinutes / 180) * 100));
                } else if (queueCount > 10 || estimatedWaitMinutes > 60) {
                    severity = 'medium';
                    percentage = Math.round((estimatedWaitMinutes / 120) * 100);
                } else {
                    severity = 'low';
                    percentage = Math.round((estimatedWaitMinutes / 60) * 100);
                }

                const operator = machine.userMachineMappings[0]?.user
                    ? `${machine.userMachineMappings[0].user.user_name}`
                    : undefined;

                return {
                    machine: machine.machine_name,
                    operator,
                    queueCount,
                    avgWait,
                    severity,
                    percentage: Math.min(percentage, 100)
                };
            })
        );

        // Sort by severity (high first) and queue count
        const sortedBottlenecks = bottlenecks
            .sort((a, b) => {
                const severityOrder = { high: 3, medium: 2, low: 1 };
                if (severityOrder[a.severity] !== severityOrder[b.severity]) {
                    return severityOrder[b.severity] - severityOrder[a.severity];
                }
                return b.queueCount - a.queueCount;
            })
            .slice(0, 5);

        return sortedBottlenecks;
    } catch (error) {
        console.error('Error fetching bottlenecks:', error);
        throw new Error('Failed to fetch bottleneck data');
    }
};



export const getAllProjectsByVendorId = (vendor_id: number) => {
    return prisma.projectMaster.findMany({
        where: {
            vendor_id: vendor_id,
        },
        orderBy: {
            project_name: 'asc', // or 'desc'
        },

    });
};


export const getAllMachinesByVendorId = (vendor_id: number) => {
    return prisma.machineMaster.findMany({
        where: {
            vendor_id: vendor_id,
        },
        orderBy: {
            machine_name: 'asc', // or 'desc'
        },

    });
};

export const getAllUsersByVendorId = (vendor_id: number) => {
    return prisma.userMaster.findMany({
        where: {
            vendor_id: vendor_id,
        },
        orderBy: {
            user_name: 'asc', // or 'desc'
        },

    });
};





export const getTrackTraceMatrix = async (
    vendor_id: number,
    project_id: number
) => {
    const mappings = await prisma.cutListMachineMapping.findMany({
        where: {
            vendor_id,
            project_id,
        },
        select: {
            actual_in_at: true,
            machine: {
                select: {
                    machine_name: true,
                },
            },
            cut_list: {
                select: {
                    id: true,
                    description: true,
                    sqmtr: true,
                    sqft: true,
                    length: true,
                    width: true,
                    thickness: true,
                    grains: true,
                    material_details: true,
                    item_name: true,
                    project_name: true,
                    qty: true,
                    unique_code: true,
                },
            },
        },
    });

    const MACHINE_COLUMNS = [
        "ELF",
        "ELB",
        "ESL",
        "ESR",
        "Sanding",
        "Pressing",
        "Cutting",
        "Edge Bend",
        "Cnc Drilling",
        "CNC router",
        "solid wood",
        "Carpentry",
        "Assembly",
        "Coating",
        "Packing",
        "Dispatch",
    ];

    const resultMap = new Map();

    mappings.forEach((row) => {
        const cut = row.cut_list;
        const machineName = row.machine.machine_name;

        if (!resultMap.has(cut.id)) {
            const baseRow: any = {
                DESCRIPTION: cut.description,
                sqmtr: cut.sqmtr,
                sqft: cut.sqft,
                LENGTH: cut.length,
                WIDTH: cut.width,
                THICKNESS: cut.thickness,
                GRAINS: cut.grains,
                MATERIAL_DETAILS: cut.material_details,
                ITEM_NAME: cut.item_name,
                PROJECT_NAME: cut.project_name,
                qty: cut.qty,
                unique_code: cut.unique_code,
                cutlistid: cut.id,
            };

            // Initialize all machines as NA
            MACHINE_COLUMNS.forEach((m) => {
                baseRow[m] = "NA";
            });

            resultMap.set(cut.id, baseRow);
        }

        // If mapping exists → override NA
        if (MACHINE_COLUMNS.includes(machineName)) {
            resultMap.get(cut.id)[machineName] =
                row.actual_in_at ?? null; // null means exists but not started
        }
    });

    return Array.from(resultMap.values());
};




export const getCutListMachine = async (vendorId: number, unique_project_id: string) => {


    const projectMaster = await prisma.projectMaster.findFirst({
        where: {
            unique_project_id: unique_project_id
        },
        select: {
            id: true
        }
    })


    const projectId = projectMaster?.id;


    // Step 1: Get all machines for this vendor (regardless of cutlist assignments)
    const allMachines = await prisma.machineMaster.findMany({
        where: {
            vendor_id: vendorId  // Assuming MachineMaster has vendor_id
        },
        select: {
            id: true,
            machine_name: true
        },
        orderBy: {
            machine_name: 'asc'
        }
    });

    const machineColumns = allMachines.map(m => m.machine_name);

    // Step 2: Fetch all cutlists with relations
    const cutLists = await prisma.cutList.findMany({
        where: {
            vendor_id: vendorId,
            project_id: projectId
        },
        include: {
            cutListMachineMapping: {
                include: {
                    machine: {
                        select: {
                            id: true,
                            machine_name: true
                        }
                    }
                }
            }
        }
    });

    // Step 3: Transform to flat structure
    //   const result = cutLists.map(cutList => {
    //     const row = { ...cutList } as any;
    //     delete row.cutListMachineMapping; // Remove nested data

    //     // Initialize all machine columns with 'No'
    //     machineColumns.forEach(machineName => {
    //       row[machineName] = 'No';
    //     });

    //     // Mark machines that are assigned to this cutlist
    //     cutList.cutListMachineMapping.forEach(mapping => {
    //       row[mapping.machine.machine_name] = 'Yes';
    //     });

    //     return row;
    //   });

    const result = cutLists.map(cutList => {
        const row: any = { ...cutList };
        delete row.cutListMachineMapping;

        // Initialize using real machine IDs
        allMachines.forEach(machine => {
            row[machine.machine_name] = {
                assigned: false,
                machineId: machine.id
            };
        });

        // Mark assigned machines
        cutList.cutListMachineMapping.forEach(mapping => {
            row[mapping.machine.machine_name] = {
                assigned: true,
                machineId: mapping.machine.id
            };
        });

        return row;
    });


    return {
        data: result,
        machineColumns: machineColumns
    };
};





export const assignMachine = async (payload: CutListSavePayload) => {

    try {
        console.log("payload.project_id",payload.project_id);
        const projectMaster = await prisma.projectMaster.findFirst({
            where: {
                unique_project_id: payload.project_id
            },
            select: {
                id: true
            }
        });

        console.log("projectMaster",projectMaster);

        const projectId = projectMaster?.id;

        if (!projectId) {
            return validationResponse(0, 'Project not found');
            //throw new Error("Project not found");
        }


        let lead_id = 0;

        const cutListIdArray = payload.cutListIds
            .split(",")
            .map(id => Number(id.trim()))
            .filter(id => !isNaN(id));



        return await prisma.$transaction(async (tx) => {

            if (!payload.assigned) {
                await tx.cutListMachineMapping.deleteMany({
                    where: {
                        cut_list_id: { in: cutListIdArray },
                        machine_id: payload.machine_id,
                        project_id: Number(projectId)
                    }
                });

                return validationResponse(1, 'Machine unmapped');

                //return { message: "Mappings removed" };
            }

            const existing = await tx.cutListMachineMapping.findMany({
                where: {
                    cut_list_id: { in: cutListIdArray },
                    machine_id: payload.machine_id,
                    project_id: Number(projectId)
                },
                select: { cut_list_id: true }
            });

            const existingIds = existing.map(e => e.cut_list_id);
            const newIds = cutListIdArray.filter(id => !existingIds.includes(id));

            const machine = await prisma.machineMaster.findFirst({
                where: {
                    id: payload.machine_id
                }
            });


            const sequence = machine?.sequence_no;

            if (newIds.length > 0) {

                if (lead_id == 0) {
                    const lead = await prisma.cutList.findFirst({
                        where: {
                            id: newIds[0]
                        },
                        select: {
                            lead_id: true
                        }
                    });

                    lead_id = Number(lead?.lead_id);
                }


                await tx.cutListMachineMapping.createMany({
                    data: newIds.map(id => ({
                        cut_list_id: id,
                        machine_id: payload.machine_id,
                        project_id: projectId,
                        vendor_id: payload.vendor_id,
                        lead_id: lead_id, // don't hardcode 1
                        sequence_no: sequence,
                        status: "Pending",
                        created_by: payload.created_by
                    }))
                });
            }

            return validationResponse(1, 'Machine mapped successfully');
            
        });
    } catch (error) {
        console.log(error)
        return validationResponse(0, 'Something went wrong');
        
    }
}