# DO NOT EDIT.
# Generated from contracts/schemas/topology.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Access(StrEnum):
    read = 'read'
    write = 'write'
    readwrite = 'readwrite'


class AccessRule(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    access: Access = Field(
        ...,
        description="read is subscribe, write is publish, readwrite is both. The spelling is mosquitto's.",
    )
    filter: str = Field(
        ...,
        description='An MQTT topic filter, which may carry the single-level wildcard + or the multi-level wildcard #.',
    )


class ComponentIdentity(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='The component id, as its configuration declares it and as its heartbeat carries it.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    role: str = Field(
        ...,
        description="The role named in the component's broker URL. Both destinations are read and are required to agree; a disagreement stops the scan rather than being resolved in favour of one.",
        pattern='^[a-z][a-z0-9_]*$',
    )
    source_root: str | None = Field(
        ...,
        description="The repository-relative directory holding this component's own source, which is what the scan walks for the topics it names. Null where the component has no source tree of its own.",
    )


class Namespace(StrEnum):
    obs = 'obs'
    ctl = 'ctl'


class Publisher(RootModel[str]):
    root: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')


class Subscriber(RootModel[str]):
    root: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')


class SourceSite(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str | None = Field(
        ...,
        description='The component whose source tree this site is in, or null for a shared library.',
    )
    path: str = Field(
        ..., description='Repository-relative path of the file holding the declaration.'
    )
    line: int = Field(
        ...,
        description='The line the declaration is on, so a reader can open it.',
        ge=1,
    )
    constant: str = Field(
        ..., description='The name the declaration binds the topic to.'
    )


class BrokerRole(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    role: str = Field(
        ...,
        description='The user name in the access control list. The password that authenticates it is produced at deploy time, appears in no tracked file, and is not read by the scanner.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    rules: list[AccessRule] = Field(
        ...,
        description="The role's rules in the order the access control list states them. Mosquitto denies by default, so an absent rule is a refusal rather than a gap.",
    )


class TopicEntry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    topic: str = Field(
        ...,
        description="The topic or filter. A component that names a branch prefix and a component that names the branch filter mean the same branch, and both are recorded here in the filter's spelling.",
    )
    namespace: Namespace = Field(
        ...,
        description='The two namespaces are conventions of the harness rather than configuration: obs carries observations, ctl carries control events, and the access control list is what makes the separation a control rather than a custom.',
    )
    schema_: str | None = Field(
        ...,
        alias='schema',
        description="The repository-relative master that governs payloads on this topic, resolved by the repository layout's naming convention. Null where no master claims the topic, which is a finding for a reader rather than a permitted state for a message.",
    )
    publishers: list[Publisher] = Field(
        ...,
        description='The components whose role the access control list permits to publish here. A permission, not an observation: it says the broker would accept the message, not that anything sends one. Where the list grants a whole namespace, every component holding that role appears.',
    )
    subscribers: list[Subscriber] = Field(
        ...,
        description='The components whose role the access control list permits to subscribe here, read the same way as publishers.',
    )
    named_by: list[SourceSite] = Field(
        ...,
        description='Every place in the tree that names this topic, with the component the source belongs to. This is the narrowing the access control list does not enforce: nine components may publish a run request and one names it. A site in a shared library carries a null component, because a library publishes on behalf of whoever calls it and guessing which components those are would be an unchecked claim of exactly the kind this artefact exists to abolish.',
    )


class DrognaBrokerTopology(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    generator: str = Field(
        ...,
        description='The repository-relative script that writes this document. Recorded so a reader who finds the file first can find the derivation second. No version and no time of generation: a document that carried either would differ on every run and the drift gate would report a change nobody made.',
    )
    roles: list[BrokerRole] = Field(
        ...,
        description='The broker roles, and what the access control list grants each. Roles are per role and not per client instance, so ten sensors share one and adding a sensor grants nothing new.',
    )
    components: list[ComponentIdentity] = Field(
        ...,
        description="The components that hold a broker identity, and the role each authenticates as. Read from the destination configurations, which is where a component's role is written down and is what the broker actually authenticates. A component with no broker section is absent from this list, which is a fact about it rather than an omission.",
    )
    topics: list[TopicEntry] = Field(
        ..., description='Every topic or topic filter the harness uses, sorted by name.'
    )
