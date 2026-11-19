import { useQuery } from "@tanstack/react-query";
import { api, type LatestResult, type SiteListItem } from "./api";

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<{ sites: SiteListItem[] }>("/sites")).data.sites,
    refetchInterval: (q) => (q.state.data?.some((s) => s.latestScan?.status === "queued" || s.latestScan?.status === "running") ? 3000 : 30_000),
  });
}

/** Latest completed scan for every site, including full findings and performance data. */
export function useLatestResults() {
  return useQuery({
    queryKey: ["latest-results"],
    queryFn: async () => (await api.get<{ results: LatestResult[] }>("/findings")).data.results,
    refetchInterval: 60_000,
  });
}
