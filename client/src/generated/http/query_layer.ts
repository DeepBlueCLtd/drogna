// DO NOT EDIT.
// Generated from contracts/openapi/query-layer.openapi.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

export type QueryLayerPath =
  | "/"
  | "/collections"
  | "/collections/forecast"
  | "/collections/forecast/area"
  | "/collections/forecast/corridor"
  | "/collections/forecast/cube"
  | "/collections/forecast/instances"
  | "/collections/forecast/instances/{instanceId}"
  | "/collections/forecast/instances/{instanceId}/area"
  | "/collections/forecast/instances/{instanceId}/corridor"
  | "/collections/forecast/instances/{instanceId}/cube"
  | "/collections/forecast/instances/{instanceId}/position"
  | "/collections/forecast/instances/{instanceId}/radius"
  | "/collections/forecast/instances/{instanceId}/trajectory"
  | "/collections/forecast/locations"
  | "/collections/forecast/locations/{locId}"
  | "/collections/forecast/position"
  | "/collections/forecast/radius"
  | "/collections/forecast/trajectory"
  | "/collections/observations"
  | "/collections/observations/items"
  | "/collections/observations/items/{featureId}"
  | "/conformance"
  | "/jobs"
  | "/jobs/{jobId}"
  | "/jobs/{jobId}/results"
  | "/openapi"
  ;

export const QUERY_LAYER_PATHS = [
  "/",
  "/collections",
  "/collections/forecast",
  "/collections/forecast/area",
  "/collections/forecast/corridor",
  "/collections/forecast/cube",
  "/collections/forecast/instances",
  "/collections/forecast/instances/{instanceId}",
  "/collections/forecast/instances/{instanceId}/area",
  "/collections/forecast/instances/{instanceId}/corridor",
  "/collections/forecast/instances/{instanceId}/cube",
  "/collections/forecast/instances/{instanceId}/position",
  "/collections/forecast/instances/{instanceId}/radius",
  "/collections/forecast/instances/{instanceId}/trajectory",
  "/collections/forecast/locations",
  "/collections/forecast/locations/{locId}",
  "/collections/forecast/position",
  "/collections/forecast/radius",
  "/collections/forecast/trajectory",
  "/collections/observations",
  "/collections/observations/items",
  "/collections/observations/items/{featureId}",
  "/conformance",
  "/jobs",
  "/jobs/{jobId}",
  "/jobs/{jobId}/results",
  "/openapi",
] as const;

export const QUERY_LAYER_OPERATIONS = {
  "/": { "get": "getLandingPage" },
  "/collections": { "get": "getCollections" },
  "/collections/forecast": { "get": "describeForecastCollection" },
  "/collections/forecast/area": { "get": "queryAreaForecast" },
  "/collections/forecast/corridor": { "get": "queryCorridorForecast" },
  "/collections/forecast/cube": { "get": "queryCubeForecast" },
  "/collections/forecast/instances": { "get": "getInstancesForecast" },
  "/collections/forecast/instances/{instanceId}": { "get": "getInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/area": { "get": "queryAreaInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/corridor": { "get": "queryCorridorInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/cube": { "get": "queryCubeInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/position": { "get": "queryPositionInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/radius": { "get": "queryRadiusInstanceForecast" },
  "/collections/forecast/instances/{instanceId}/trajectory": { "get": "queryTrajectoryInstanceForecast" },
  "/collections/forecast/locations": { "get": "getLocationsForecast" },
  "/collections/forecast/locations/{locId}": { "get": "getLocationForecast" },
  "/collections/forecast/position": { "get": "queryPositionForecast" },
  "/collections/forecast/radius": { "get": "queryRadiusForecast" },
  "/collections/forecast/trajectory": { "get": "queryTrajectoryForecast" },
  "/collections/observations": { "get": "describeObservationsCollection" },
  "/collections/observations/items": { "get": "getObservationsFeatures", "options": "optionsObservationsFeatures" },
  "/collections/observations/items/{featureId}": { "get": "getObservationsFeature", "options": "optionsObservationsFeature" },
  "/conformance": { "get": "getConformanceDeclaration" },
  "/jobs": { "get": "getJobs" },
  "/jobs/{jobId}": { "delete": "deleteJob", "get": "getJob" },
  "/jobs/{jobId}/results": { "get": "getJobResults" },
  "/openapi": { "get": "getOpenapi" },
} as const;
