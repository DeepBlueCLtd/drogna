// DO NOT EDIT.
// Generated from contracts/schemas/edr-locations.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The list the EDR locations query type serves: every named place the query layer will answer a location query for, as a GeoJSON-compatible FeatureCollection. Two kinds of entry, distinguished so a consumer never has to guess: the seeded synthetic features with a fixed horizontal position, and sensor platforms at the position of their latest reported observation — current position only. The harness holds no location history and this list never becomes one (Constitution V): one entry per place, no past positions, and the list itself refuses a datetime filter. Everything here is synthetic; the numerics are deliberately fake and no entry describes a real place.
 */
export interface DrognaEDRNamedLocations {
  /** GeoJSON's own name for the shape, so any GeoJSON reader can draw the list. */
  type: "FeatureCollection";
  /**
   * The advertised locations. Bounded by the configured locations_maximum_locations: a longer list is refused with the count and the limit named, never truncated.
   */
  features: NamedLocation[];
}

/**
 * One server-advertised queryable place: an identifier the locations data query answers for, a point geometry, and the kind that says where the position came from.
 */
export interface NamedLocation {
  type: "Feature";
  /**
   * The identifier a locations data query names: a seeded feature's own identifier, or a Thing's.
   */
  id: string;
  geometry: Point;
  properties: Attributes;
}

/** Where the location is, as a GeoJSON Point: longitude then latitude, CRS84. */
export interface Point {
  type: "Point";
  coordinates: number[];
}

/** What kind of place this is, and — for a sensor — when its position was current. */
export interface Attributes {
  /** One line for a person reading the list. */
  name: string;
  /**
   * feature: a seeded synthetic feature at its seeded position, from configuration. sensor: a sampling platform at the position of its latest reported observation, derived from the observation store at request time.
   */
  kind: "feature" | "sensor";
  /**
   * Sensor entries only: the phenomenon time of the observation the position comes from — simulation time, ISO-8601 UTC. The position is current as of this instant and no history is held behind it. Absent on feature entries, whose seeded position has no time.
   */
  as_of?: string;
}
