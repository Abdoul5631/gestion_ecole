from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0009_ecole_tenant'),
    ]

    operations = [
        migrations.AddField(
            model_name='inscription',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
