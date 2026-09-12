## ADDED Requirements

### Requirement: Initialization can provision missing mapped labels explicitly

Initialization SHALL offer explicit opt-in preview and apply of only missing configured workflow labels in the exactly bound GitHub repository. Default initialization, inspection and checking SHALL remain remotely read-only. Provisioning SHALL preserve existing labels, names, descriptions, colors, unrelated labels and work records; it SHALL not rename/delete labels or classify Issues. Missing permission, unavailable tools and partial application SHALL be reported with observed effects, not as complete setup.

Apply SHALL require explicit authorization and fresh validation of target identity, configuration and proposed operations. A conflicting or changed preview SHALL not authorize writes. Local-only mode SHALL not pretend to perform remote provisioning. Label availability SHALL not establish policy adoption, activation or Issue readiness.

#### Scenario: Only two configured labels are missing
- **WHEN** the user explicitly applies a valid provisioning preview to the same bound target
- **THEN** only those missing labels are created and verified; existing labels and Issue records remain unchanged

#### Scenario: Access fails after a partial write
- **WHEN** one allowed label creation succeeds and a later request fails
- **THEN** setup reports the actual partial result and remaining operations without deleting existing data or claiming complete initialization

#### Scenario: Provisioning was not selected
- **WHEN** initialization is used without opt-in provisioning, or inspect/check is run
- **THEN** missing mapped labels are reported as before and no GitHub mutation occurs

### Requirement: Brownfield adoption establishes a reviewed current project definition

Adoption guidance SHALL distinguish installing the toolkit from bringing an existing project's selected scope under it. For Brownfield work, it SHALL identify an explicit target and coverage boundary, inspect existing code/tests/docs as evidence, preserve useful current requirements and distinguish intended behavior, observed implementation, conflicts, assumptions and unknowns. It SHALL guide a reviewed current product definition through native OpenSpec rather than treating code as automatic intent, copying framework Specs into product Specs or reconstructing every historical conversation.

The first bounded path SHALL support one selected repository or area, meaningful requirement-level references and reviewable source anchors. It SHALL identify what remains outside adoption and require human agreement on substantive product intent before promoting the baseline. Subsequent work in the adopted scope SHALL use that baseline and the normal change process. A tool installation, inventory or local walkthrough SHALL not claim full-project conversion or verified product behavior.

#### Scenario: Existing code has no reliable current Spec
- **WHEN** an owner chooses a bounded area for adoption
- **THEN** the executor develops source-linked candidate requirements with explicit uncertainties, reviews them with the owner and an independent reviewer, and synchronizes only the accepted definition through native OpenSpec

#### Scenario: Existing specification conflicts with code
- **WHEN** implementation and intended requirements disagree
- **THEN** the disagreement is retained for decision rather than automatically rewriting either as truth or claiming the existing behavior has been validated

#### Scenario: Only one area has been assessed
- **WHEN** the declared Brownfield scope covers only part of an existing repository
- **THEN** adoption reports that boundary and uncovered areas; future work outside it must establish its own basis instead of inheriting a whole-repository completion claim

## MODIFIED Requirements

### Requirement: Distribute as an installable package

The toolkit SHALL be distributable as a versioned npm package with a Node.js CLI and explicit project initialization. An installed package SHALL contain the runtime, schemas, templates, reusable Skill sources and identified framework contracts needed without cloning the source repo. Initialization SHALL write only agreed target configuration/discovery artifacts and preserve consumer work; separately opted-in mapped-label provisioning SHALL follow its explicit preview/apply authorization and narrow remote-write boundary. Packed artifacts SHALL exclude instance configuration, project change history, credentials and execution logs.

#### Scenario: Packed CLI initializes an unrelated project
- **WHEN** the packed npm artifact is installed and invoked against a new consumer fixture
- **THEN** its CLI can initialize and inspect that target using the packaged assets and explicit bindings, without copying AssuredLoop's own project records or requiring its source checkout
