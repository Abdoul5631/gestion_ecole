from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Parametres = apps.get_model('parametres', 'Parametres')
    ecole, _ = Parametres.objects.get_or_create(
        pk=1,
        defaults={'nom_ecole': 'Complexe Scolaire Wend-Panga', 'ville': 'Bobo-Dioulasso'},
    )
    for name in ('Notification', 'SmsOutbox'):
        Model = apps.get_model('notifications', name)
        Model.objects.filter(ecole__isnull=True).update(ecole=ecole)


class Migration(migrations.Migration):

    dependencies = [
        ('parametres', '0005_parametres_seuil_passage'),
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='notifications', to='parametres.parametres'),
        ),
        migrations.AddField(
            model_name='smsoutbox', name='ecole',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name='sms', to='parametres.parametres'),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
