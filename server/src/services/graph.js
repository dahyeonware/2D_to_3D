// 서버 측 그래프 분석 — 프론트와 같은 shared/graph.js 로직 사용
import { buildAdjacency, neighbors, impact, upstream, upChain } from '../../../shared/graph.js';

const toJson = (r) => ({
  nodes: [...r.nodes],
  edges: [...r.edges],
  roots: [...r.roots],
  ...(r.dist ? { dist: Object.fromEntries(r.dist) } : {}),
});

export function createGraphService(data) {
  const adjOf = async (tsId) => buildAdjacency(await data.equipment(tsId), await data.connections(tsId));
  return {
    async neighbors(tsId, id, depth, { wired = true, wireless = true } = {}) {
      const typeOn = (c) => (c.type === 'wired' ? wired : wireless);
      return toJson(neighbors(await adjOf(tsId), id, depth, typeOn));
    },
    impact: async (tsId, id) => toJson(impact(await adjOf(tsId), id)),
    async upstream(tsId, id) {
      const adj = await adjOf(tsId);
      const chain = (layer) => upChain(adj, id, layer).map((n) => ({ id: n.id, connection: n.c.id, protocol: n.c.protocol }));
      return { ...toJson(upstream(adj, id)), chains: { data: chain('data'), power: chain('power') } };
    },
  };
}
