# Medical reminder functions

`sendDailyMedicalNotifications` runs every day at 08:00 in `Asia/Tokyo` and sends plain-text Gmail reminders. SMTP credentials are read only from the `GMAIL_USER` and `GMAIL_APP_PASSWORD` Firebase Functions secrets.

`sendMedicalNotificationTest` is an authenticated callable function. The app's **通知メールの動作確認** control calls it and sends a generic test message only to the current Firebase Authentication user's email address. It does not accept a recipient address or medical content from the client.

`APP_URL` is a non-secret string parameter with `https://work-diary-rose.vercel.app` as its default.
