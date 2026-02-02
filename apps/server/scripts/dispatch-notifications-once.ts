import { dispatchNotifications } from '../src/jobs/notification-dispatcher.js';

async function main() {
  const [, , referenceIso] = process.argv;
  const referenceDate = referenceIso ? new Date(referenceIso) : new Date();

  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('Invalid date. Use ISO format like 2026-02-02T12:00:00+09:00');
  }

  await dispatchNotifications(referenceDate);
  console.log(
    `[dispatch-notifications-once] done (reference=${referenceDate.toISOString()}, dry_run=${process.env.NOTIFICATION_DISPATCH_DRY_RUN === 'true'})`,
  );
}

main().catch((error) => {
  console.error('[dispatch-notifications-once] failed', error);
  process.exit(1);
});
