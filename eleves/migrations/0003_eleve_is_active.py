from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('eleves', '0002_add_parent_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='eleve',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
