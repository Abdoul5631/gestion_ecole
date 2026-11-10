from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('caisse', '0002_ecole_tenant'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarifniveau',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
