// DO NOT EDIT.
// Generated from contracts/schemas/topology.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * Who may say what to whom on the broker, and where the tree says it. Derived from the repository by scripts/scan_topology.py and written to contracts/topology.json, which is generated and gated: scripts/check_topology_drift.py fails when the committed instance no longer matches a fresh scan, for the same reason the generated type trees have a drift check. Two layers, and they are deliberately not the same thing. The publishers and subscribers of a topic are permissions, read from deploy/broker/acl, which mosquitto enforces and which is therefore the only complete statement of the boundary; they are coarse wherever that file is coarse, and the control role's readwrite over the whole control namespace is the coarsest place. What narrows them is named_by, the places in the tree that actually name the topic. Neither layer is a claim about a running system: nothing here says a component exists, is alive, or has ever sent anything, and a display built on it must light a cell from received traffic and never from this document (Constitution VII).
 */
export interface DrognaBrokerTopology {
  /**
   * The repository-relative script that writes this document. Recorded so a reader who finds the file first can find the derivation second. No version and no time of generation: a document that carried either would differ on every run and the drift gate would report a change nobody made.
   */
  generator: string;
  /**
   * The broker roles, and what the access control list grants each. Roles are per role and not per client instance, so ten sensors share one and adding a sensor grants nothing new.
   */
  roles: BrokerRole[];
  /**
   * The components that hold a broker identity, and the role each authenticates as. Read from the destination configurations, which is where a component's role is written down and is what the broker actually authenticates. A component with no broker section is absent from this list, which is a fact about it rather than an omission.
   */
  components: ComponentIdentity[];
  /** Every topic or topic filter the harness uses, sorted by name. */
  topics: TopicEntry[];
}

/** One authenticated identity at the broker, and its rules. */
export interface BrokerRole {
  /**
   * The user name in the access control list. The password that authenticates it is produced at deploy time, appears in no tracked file, and is not read by the scanner.
   */
  role: string;
  /**
   * The role's rules in the order the access control list states them. Mosquitto denies by default, so an absent rule is a refusal rather than a gap.
   */
  rules: AccessRule[];
}

/** One line of the access control list: a direction and the topic filter it applies to. */
export interface AccessRule {
  /** read is subscribe, write is publish, readwrite is both. The spelling is mosquitto's. */
  access: "read" | "write" | "readwrite";
  /**
   * An MQTT topic filter, which may carry the single-level wildcard + or the multi-level wildcard #.
   */
  filter: string;
}

/** A component and the broker role it presents. */
export interface ComponentIdentity {
  /** The component id, as its configuration declares it and as its heartbeat carries it. */
  id: string;
  /**
   * The role named in the component's broker URL. Both destinations are read and are required to agree; a disagreement stops the scan rather than being resolved in favour of one.
   */
  role: string;
  /**
   * The repository-relative directory holding this component's own source, which is what the scan walks for the topics it names. Null where the component has no source tree of its own.
   */
  source_root: string | null;
}

/** One topic, its governing shape, who may speak on it, and where the tree names it. */
export interface TopicEntry {
  /**
   * The topic or filter. A component that names a branch prefix and a component that names the branch filter mean the same branch, and both are recorded here in the filter's spelling.
   */
  topic: string;
  /**
   * The two namespaces are conventions of the harness rather than configuration: obs carries observations, ctl carries control events, and the access control list is what makes the separation a control rather than a custom.
   */
  namespace: "obs" | "ctl";
  /**
   * The repository-relative master that governs payloads on this topic, resolved by the repository layout's naming convention. Null where no master claims the topic, which is a finding for a reader rather than a permitted state for a message.
   */
  schema: string | null;
  /**
   * The components whose role the access control list permits to publish here. A permission, not an observation: it says the broker would accept the message, not that anything sends one. Where the list grants a whole namespace, every component holding that role appears.
   */
  publishers: string[];
  /**
   * The components whose role the access control list permits to subscribe here, read the same way as publishers.
   */
  subscribers: string[];
  /**
   * Every place in the tree that names this topic, with the component the source belongs to. This is the narrowing the access control list does not enforce: nine components may publish a run request and one names it. A site in a shared library carries a null component, because a library publishes on behalf of whoever calls it and guessing which components those are would be an unchecked claim of exactly the kind this artefact exists to abolish.
   */
  named_by: SourceSite[];
}

/** One place in the tree that names a topic. */
export interface SourceSite {
  /** The component whose source tree this site is in, or null for a shared library. */
  component: string | null;
  /** Repository-relative path of the file holding the declaration. */
  path: string;
  /** The line the declaration is on, so a reader can open it. */
  line: number;
  /** The name the declaration binds the topic to. */
  constant: string;
}
