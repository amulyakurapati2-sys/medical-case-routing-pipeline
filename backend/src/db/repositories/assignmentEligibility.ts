import type {
  Department,
  Specialist,
} from "../../generated/prisma/index.js";

type AssignmentSpecialist = Pick<
  Specialist,
  "department" | "onPto" | "maxCapacity"
>;

export class AssignmentEligibilityError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "AssignmentEligibilityError";
  }
}

export function assignmentRejectionReason(
  specialist: AssignmentSpecialist,
  expectedDepartment: Department,
  currentLoad: number,
): string | null {
  if (specialist.onPto) {
    return "Selected specialist is now on PTO";
  }
  if (specialist.department !== expectedDepartment) {
    return "Selected specialist no longer matches the case department";
  }
  if (currentLoad >= specialist.maxCapacity) {
    return `Selected specialist reached capacity (${currentLoad}/${specialist.maxCapacity})`;
  }
  return null;
}
