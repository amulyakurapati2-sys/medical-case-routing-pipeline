/**
 * Specialist persistence and derived workload counts.
 *
 * Current load is counted from open assigned cases — not a stored counter
 * that can drift out of sync.
 */
import type { Department, Specialist } from "../../generated/prisma/index.js";
import { CaseStatus } from "../../generated/prisma/index.js";
import { prisma } from "../prisma.js";

const OPEN_ASSIGNMENT_STATUSES: CaseStatus[] = [
  CaseStatus.ASSIGNED,
  CaseStatus.REASSIGNED,
];

async function getDerivedLoad(id: string): Promise<number> {
  return prisma.case.count({
    where: {
      assignedSpecialistId: id,
      status: { in: OPEN_ASSIGNMENT_STATUSES },
    },
  });
}

export const specialistRepository = {
  async findAll(): Promise<Specialist[]> {
    return prisma.specialist.findMany({
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });
  },

  async findById(id: string): Promise<Specialist | null> {
    return prisma.specialist.findUnique({ where: { id } });
  },

  async updateAvailability(id: string, onPto: boolean): Promise<Specialist> {
    return prisma.specialist.update({
      where: { id },
      data: { onPto },
    });
  },

  /** Number of open cases currently assigned to this specialist. */
  getDerivedLoad,

  /**
   * Candidates for assignment: matching department, not on PTO, under capacity.
   * Expertise filtering is left to U5 rules when requiredExpertise is known;
   * optional `expertiseContains` narrows with Postgres array containment.
   */
  async findEligibleByDepartment(
    department: Department,
    options?: { expertiseContains?: string[] },
  ): Promise<(Specialist & { currentLoad: number })[]> {
    const specialists = await prisma.specialist.findMany({
      where: {
        department,
        onPto: false,
        ...(options?.expertiseContains?.length
          ? { expertise: { hasEvery: options.expertiseContains } }
          : {}),
      },
      orderBy: { name: "asc" },
    });

    const withLoad = await Promise.all(
      specialists.map(async (s) => ({
        ...s,
        currentLoad: await getDerivedLoad(s.id),
      })),
    );

    return withLoad.filter((s) => s.currentLoad < s.maxCapacity);
  },
};
