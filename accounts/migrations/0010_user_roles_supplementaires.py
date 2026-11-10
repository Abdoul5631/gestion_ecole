from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_user_signature'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='roles_supplementaires',
            field=models.JSONField(blank=True, default=list, help_text="Petites écoles : rôles cumulés par la même personne (voir accounts.roles.CUMULS_AUTORISES)."),
        ),
    ]
