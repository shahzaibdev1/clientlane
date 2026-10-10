export const guides = [
  {
    slug: 'client-onboarding',
    title: 'Get the content you need before the project stalls',
    description: 'A practical client onboarding checklist for freelance website projects.',
    category: 'Client onboarding',
    readTime: '4 minute read',
    intro:
      'A signed proposal does not mean a website is ready to build. Copy, photographs, access, and a person who can make decisions are often still missing. Agree on those inputs before you promise a delivery date.',
    sections: [
      {
        heading: 'Give each request an owner and a date',
        text: '“Please send your content” is too broad. Ask for one specific item at a time: homepage copy, company logo, five product photographs, or the name of the approver. State the format, where to submit it, who owns it, and when you need it. Put an example beside unfamiliar requests.',
        checklist: [
          'Business goal and target audience',
          'Page list and copy for each page',
          'Logo files and approved brand colors',
          'Images with permission to use them',
          'A named decision maker and review dates',
        ],
      },
      {
        heading: 'Separate essentials from things that can wait',
        text: 'Mark the inputs that block your next milestone. A missing launch photograph may not block a wireframe; a missing page list probably does. Start work when the essentials are ready, while making the remaining dependencies visible. Avoid collecting passwords in project comments—use the service’s invitation or a secure sharing method.',
      },
      {
        heading: 'Make reminders useful',
        text: 'Every reminder should name what is still missing, the requested date, and the next step it blocks. Give clients a direct link to the request. Stop reminders once an item is submitted; review it and explain specifically if it needs to be replaced. Agree on a reasonable reminder schedule together.',
      },
      {
        heading: 'Confirm the impact of a delay',
        text: 'If client materials arrive late, explain the effect on the schedule and propose a new delivery date. Ask for confirmation rather than silently moving the deadline. Keep the original date and the agreed change in the project record.',
      },
    ],
  },
  {
    slug: 'manage-client-revisions',
    title: 'Keep revisions clear before they become extra work',
    description:
      'Define revision rounds, gather consolidated feedback, and agree on changes outside the original scope.',
    category: 'Revisions & approvals',
    readTime: '4 minute read',
    intro:
      '“Two revisions included” can mean very different things to you and your client. Define the process before the first delivery so neither person has to negotiate the meaning halfway through a project.',
    sections: [
      {
        heading: 'Define what one round means',
        text: 'A workable definition is one consolidated set of feedback on one submitted version, followed by one updated delivery. Ask the client to collect stakeholder feedback before requesting changes. Distinguish corrections to your own mistakes from a new direction or additional deliverables; agree on the treatment in your scope.',
        checklist: [
          'Number of included revision rounds',
          'What counts as one round',
          'Who consolidates feedback',
          'Deadline for each review',
          'How additional work will be quoted',
        ],
      },
      {
        heading: 'Attach feedback to the version being reviewed',
        text: 'Name deliveries clearly and preserve older versions. “Make the header smaller” is ambiguous if the client is looking at last week’s draft. Put comments and the review decision next to the specific version. Make the current version obvious and keep old comments available as history.',
      },
      {
        heading: 'Make extra work a decision',
        text: 'When a request exceeds the agreed scope, describe the additional deliverable, price, and effect on the deadline. Let the client accept or decline before you begin. A visible change request is clearer than a surprise on the final invoice.',
      },
      {
        heading: 'Record approval and hand over cleanly',
        text: 'Ask for an explicit approval of the current version, not a vague “looks good” buried in a thread. Preserve the version, reviewer, and date. At handover, share only approved final assets, with a short explanation of what each file is for. An approval record supports clarity; it is not a substitute for a suitable contract.',
      },
    ],
  },
  {
    slug: 'project-delays',
    title: 'Manage several client projects without losing the next action',
    description:
      'A daily review system for deadlines, missing client inputs, and delivery commitments.',
    category: 'Project delivery',
    readTime: '3 minute read',
    intro:
      'A long task list does not tell you which project is actually stuck. Review work by its next action: something you need to do, something your client needs to do, or a decision that needs agreement.',
    sections: [
      {
        heading: 'Start the day with three lists',
        text: 'Review overdue actions, work due soon, and projects waiting on someone else. Each item needs a named owner and a concrete next step. “Acme website” is not an action; “send homepage version two for approval” is.',
        checklist: [
          'What needs my attention today?',
          'What am I waiting for from each client?',
          'Which delivery dates are at risk?',
        ],
      },
      {
        heading: 'Show dependencies instead of vague status labels',
        text: 'A project marked “in progress” may have been blocked for a week. Name the missing request or approval and the milestone it affects. Track how long an overdue input has been outstanding, while avoiding claims that every late input delays the whole project by the same amount.',
      },
      {
        heading: 'Send one useful weekly update',
        text: 'Summarize what was completed, what the client needs to do, and what comes next. Group multiple requests so the client receives a manageable digest. Link directly to the actions instead of asking them to search through files and messages.',
      },
      {
        heading: 'Renegotiate dates explicitly',
        text: 'When a dependency changes, propose a revised date and explain why. Preserve the old commitment and get agreement on the new one. Leave room for your other client commitments; a late submission does not automatically get the next available day.',
      },
    ],
  },
] as const;
