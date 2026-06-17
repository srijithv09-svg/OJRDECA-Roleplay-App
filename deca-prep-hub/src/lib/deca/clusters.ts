export const decaClusters = [
  {
    value: "entrepreneurship",
    label: "Entrepreneurship",
    description: "New ventures, innovation, ownership, and startup decision making.",
    eventClusterNames: ["Entrepreneurship"],
  },
  {
    value: "marketing",
    label: "Marketing",
    description: "Promotion, merchandising, selling, marketing communications, and customer strategy.",
    eventClusterNames: ["Marketing"],
  },
  {
    value: "business_management_administration",
    label: "Business Management and Administration",
    description: "Management, ethics, human resources, operations, and business services.",
    eventClusterNames: ["Business Management and Administration", "Management"],
  },
  {
    value: "hospitality_tourism",
    label: "Hospitality and Tourism",
    description: "Restaurant, lodging, travel, tourism, and guest experience events.",
    eventClusterNames: ["Hospitality and Tourism", "Hospitality"],
  },
  {
    value: "finance",
    label: "Finance",
    description: "Accounting, business finance, financial services, and money management.",
    eventClusterNames: ["Finance"],
  },
] as const;

export type DecaClusterPreference = (typeof decaClusters)[number]["value"];

export function isDecaClusterPreference(value: unknown): value is DecaClusterPreference {
  return typeof value === "string" && decaClusters.some((cluster) => cluster.value === value);
}

export function getDecaClusterLabel(value: DecaClusterPreference | null | undefined) {
  return decaClusters.find((cluster) => cluster.value === value)?.label ?? null;
}

export function getDecaClusterEventNames(value: DecaClusterPreference | null | undefined) {
  return decaClusters.find((cluster) => cluster.value === value)?.eventClusterNames ?? [];
}

export function eventMatchesSelectedCluster(
  eventCluster: string | null | undefined,
  selectedCluster: DecaClusterPreference | null | undefined,
) {
  if (!eventCluster || !selectedCluster) {
    return false;
  }

  const normalizedEventCluster = eventCluster.trim().toLowerCase();

  return getDecaClusterEventNames(selectedCluster).some(
    (clusterName) => clusterName.toLowerCase() === normalizedEventCluster,
  );
}
