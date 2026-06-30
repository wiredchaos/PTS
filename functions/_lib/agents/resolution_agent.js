/**
 * resolution_agent.js — IRS/FTB resolution case analysis.
 *
 * ONLY runs when client.case_type === 'resolution'.
 * Returns credentialed_only placeholder if IRS/FTB connector not configured via env.
 * Never makes actual calls to credentialed IRS/FTB APIs unless connector is configured.
 */

/**
 * @param {object} context - { env, db, kv, clientId, client }
 * @param {object} input - { caseType?, balance?, noticeCodes?, taxYears? }
 */
export async function run(context, input) {
  const { client } = context;

  // Enforcement: only run for resolution clients
  if (!client || client.case_type !== 'resolution') {
    return {
      skipped: true,
      skipped_reason: 'resolution_agent only runs for case_type=resolution clients',
      requires_human_review: false,
    };
  }

  // Check if credentialed connectors are configured
  const irsConnected = Boolean(context.env && context.env.IRS_CONNECTOR_KEY);
  const ftbConnected = Boolean(context.env && context.env.FTB_CONNECTOR_KEY);

  if (!irsConnected && !ftbConnected) {
    return {
      credentialed_only: true,
      message:
        'IRS/FTB connector not configured. Configure IRS_CONNECTOR_KEY or FTB_CONNECTOR_KEY in environment to enable live resolution data.',
      resolution_checklist: buildResolutionChecklist(input),
      requires_human_review: true,
      citations: [
        {
          type: 'IRS_PUB',
          reference: 'IRS Publication 594',
          description: 'The IRS Collection Process — overview of resolution options.',
        },
        {
          type: 'IRS_PUB',
          reference: 'IRS Publication 1660',
          description: 'Collection Appeal Rights.',
        },
      ],
    };
  }

  // Connector is configured — return placeholder for actual connector integration
  return {
    credentialed_only: false,
    connector_status: { irs: irsConnected, ftb: ftbConnected },
    message: 'Connector configured. Implement live IRS/FTB API calls via connector module.',
    resolution_checklist: buildResolutionChecklist(input),
    requires_human_review: true,
    citations: [
      {
        type: 'IRC',
        reference: 'IRC § 7122',
        description: 'Offers in compromise — authority and procedures.',
      },
      {
        type: 'IRC',
        reference: 'IRC § 6159',
        description: 'Installment agreements — authority for the IRS to enter into agreements.',
      },
    ],
  };
}

function buildResolutionChecklist(input) {
  const checklist = [
    { step: 'Obtain IRS transcript (Account, Wage & Income, Return)', status: 'pending' },
    { step: 'Identify tax years with balances due', status: 'pending' },
    { step: 'Review notice codes for levy/lien risk', status: 'pending' },
    { step: 'Assess Collection Statute Expiration Date (CSED)', status: 'pending' },
    { step: 'Evaluate resolution options: CNC, IA, OIC, Penalty Abatement', status: 'pending' },
    { step: 'Prepare Form 433-A or 433-B financial disclosure if required', status: 'pending' },
    { step: 'Confirm CAF number / POA authorization on file', status: 'pending' },
  ];

  const noticeCodes = Array.isArray(input.noticeCodes) ? input.noticeCodes : [];
  if (noticeCodes.includes('CP504') || noticeCodes.includes('LT11')) {
    checklist.unshift({
      step: 'URGENT: Levy notice received — immediate response required',
      status: 'urgent',
    });
  }

  return checklist;
}
